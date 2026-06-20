import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pull the first email address out of a raw header value like
// `"Jane Doe" <jane@x.com>, other@y.com`.
function firstEmail(raw) {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.join(",") : String(raw);
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Receives an inbound email (posted by the Cloudflare Email Worker) and files it
// on the right estate's communications timeline. The estate is identified by the
// token in the recipient's local part: <token>@<inbound-domain>. Senders we can
// match to a contact attach to that contact; unknown senders land with no
// contact (the "Unmatched" tray) for the executor to assign.
//
// Secured by a shared secret the Worker sends — this endpoint is public.
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const secret = event.headers["x-inbound-secret"] || event.headers["X-Inbound-Secret"];
  if (!process.env.INBOUND_WEBHOOK_SECRET || secret !== process.env.INBOUND_WEBHOOK_SECRET) {
    return { statusCode: 401, body: "unauthorized" };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: "invalid body" }; }

  // The Worker sends: { to, from, subject, text, html }
  const toAddr = firstEmail(payload.to);
  const fromAddr = firstEmail(payload.from);
  const subject = (payload.subject || "(no subject)").slice(0, 300);
  const bodyText = (payload.text || payload.html || "").toString();

  // Identify the estate from the token in the recipient's local part.
  const token = toAddr ? toAddr.split("@")[0].trim().toLowerCase() : null;
  if (!token) return { statusCode: 200, body: "no recipient token" };

  const { data: estate } = await admin.from("estates").select("id").eq("inbound_token", token).maybeSingle();
  if (!estate) {
    console.warn("inbound-email: no estate for token", token);
    return { statusCode: 200, body: "no matching estate" }; // 200 so the sender isn't retried forever
  }

  // Try to match the sender to a contact on this estate (or one shared with it).
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
