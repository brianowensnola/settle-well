import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Inbound SMS capture (Brevo). DORMANT until the toll-free number is approved.
// To activate when the number is live:
//   1. Set a Netlify env var INBOUND_SMS_SECRET to any random string.
//   2. In Brevo, point the inbound SMS webhook at:
//        https://settle-well.netlify.app/.netlify/functions/inbound-sms?token=<INBOUND_SMS_SECRET>
// Unlike email (per-estate inbound addresses), all estates share ONE number, so
// we route an incoming text by matching the SENDER's phone to a contact/user.
// ---------------------------------------------------------------------------

const digits = s => String(s || "").replace(/[^\d]/g, "");
const last10 = s => digits(s).slice(-10);

export const handler = async (event) => {
  // Optional shared-secret check to reject spoofed posts.
  const secret = process.env.INBOUND_SMS_SECRET;
  if (secret && event.queryStringParameters?.token !== secret) {
    return { statusCode: 401, body: "unauthorized" };
  }

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 200, body: "bad payload" }; }

  // Brevo inbound payload field names vary; accept the common shapes.
  const fromRaw = payload.from || payload.sender || payload.msisdn || payload.originator || "";
  const text = payload.text || payload.message || payload.content || payload.body || "";
  const fromDigits = last10(fromRaw);
  if (!fromDigits) return { statusCode: 200, body: "no sender" };

  // Route by matching the sender's phone to a contact (then an app user).
  const { data: contacts } = await admin.from("estate_contacts").select("id, name, phone, estate_id");
  const match = (contacts || []).find(c => c.phone && last10(c.phone) === fromDigits);
  let estateId = match?.estate_id || null;
  let contactId = match?.id || null;
  let senderName = match?.name || null;

  if (!estateId) {
    const { data: users } = await admin.from("estate_users").select("name, phone, estate_id");
    const u = (users || []).find(x => x.phone && last10(x.phone) === fromDigits);
    if (u) { estateId = u.estate_id; senderName = u.name; }
  }

  // With a shared number and no estate match, we can't route it — log and drop.
  if (!estateId) {
    console.warn("inbound-sms: no estate match for sender", fromDigits);
    return { statusCode: 200, body: "no matching estate" };
  }

  await admin.from("estate_contact_interactions").insert({
    estate_id: estateId,
    contact_id: contactId,
    direction: "inbound",
    channel: "text",
    subject: null,
    summary: `Text from ${senderName || fromRaw}: ${String(text).slice(0, 280)}${String(text).length > 280 ? "…" : ""}`,
    body: text,
    is_private: false,
    source: "inbound",
    occurred_at: new Date().toISOString(),
  });

  return { statusCode: 200, body: JSON.stringify({ filed: true, estateId, matched: !!contactId }) };
};
