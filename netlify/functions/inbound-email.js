import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pull the first email address out of a header value like `"Jane" <jane@x.com>`.
function firstEmail(raw) {
  if (!raw) return null;
  const m = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Minimal multipart/form-data parser for TEXT fields (Mailgun posts inbound
// mail this way). Attachment parts (those with a filename) are skipped — we
// only need the parsed text fields here. Returns { fieldName: value }.
function parseTextFields(buf, boundary) {
  const fields = {};
  const data = buf.toString("latin1");
  for (const sec of data.split(`--${boundary}`)) {
    const nameM = sec.match(/name="([^"]+)"/);
    if (!nameM || /filename="/.test(sec)) continue;
    const idx = sec.indexOf("\r\n\r\n");
    if (idx === -1) continue;
    const val = sec.slice(idx + 4).replace(/\r\n$/, "");
    fields[nameM[1]] = Buffer.from(val, "latin1").toString("utf8");
  }
  return fields;
}

// Inbound email from Mailgun. Verifies Mailgun's signature, identifies the
// estate from the token in the recipient address (<token>@<inbound-domain>),
// matches the sender to a contact, and files it on the communications timeline.
// Unknown senders land with no contact (the "Unmatched" tray).
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";
  const bM = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!bM) return { statusCode: 400, body: "expected multipart/form-data" };
  const boundary = (bM[1] || bM[2]).trim();

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : Buffer.from(event.body || "", "utf8");
  const f = parseTextFields(raw, boundary);

  // Verify Mailgun signature: HMAC-SHA256(signing key, timestamp + token).
  const signingKey = process.env.MAILGUN_SIGNING_KEY;
  if (!signingKey) return { statusCode: 500, body: "MAILGUN_SIGNING_KEY not configured" };
  const expected = crypto.createHmac("sha256", signingKey).update((f.timestamp || "") + (f.token || "")).digest("hex");
  if (!f.signature || expected !== f.signature) {
    console.warn("inbound-email: bad Mailgun signature");
    return { statusCode: 401, body: "bad signature" };
  }

  const toAddr = firstEmail(f.recipient);
  const fromAddr = firstEmail(f.sender || f.from);
  const subject = (f.subject || "(no subject)").slice(0, 300);
  const bodyText = (f["body-plain"] || f["stripped-text"] || f["body-html"] || "").toString();

  const token = toAddr ? toAddr.split("@")[0].trim().toLowerCase() : null;
  if (!token) return { statusCode: 200, body: "no recipient token" };

  const { data: estate } = await admin.from("estates").select("id").eq("inbound_token", token).maybeSingle();
  if (!estate) {
    console.warn("inbound-email: no estate for token", token);
    return { statusCode: 200, body: "no matching estate" }; // 200 so it isn't retried forever
  }

  let contactId = null;
  if (fromAddr) {
    const { data: contacts } = await admin.from("estate_contacts")
      .select("id, emails, estate_id, shared_with")
      .or(`estate_id.eq.${estate.id},shared_with.cs.{${estate.id}}`);
    const match = (contacts || []).find(c => (c.emails || []).some(e => (e || "").toLowerCase() === fromAddr));
    contactId = match?.id ?? null;
  }

  await admin.from("estate_contact_interactions").insert({
    estate_id: estate.id,
    contact_id: contactId,
    direction: "inbound",
    channel: "email",
    subject,
    summary: `From ${fromAddr || "unknown sender"}: ${bodyText.slice(0, 280)}${bodyText.length > 280 ? "…" : ""}`,
    body: bodyText,
    is_private: false,
    source: "inbound",
    occurred_at: new Date().toISOString(),
  });

  return { statusCode: 200, body: JSON.stringify({ filed: true, matched: !!contactId }) };
};
