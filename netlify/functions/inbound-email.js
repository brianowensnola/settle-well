import PostalMime from "postal-mime";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function firstEmail(raw) {
  if (!raw) return null;
  const s = Array.isArray(raw) ? raw.map(x => (x && x.address) ? x.address : x).join(",") : (raw.address || String(raw));
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

// Inbound email via Amazon SES → SNS. SES delivers each message to an SNS topic;
// SNS POSTs it here. We confirm the subscription handshake, then for each
// notification pull from/to/subject from SES's parsed headers and the body from
// the raw MIME (postal-mime). The estate is identified by the token in the
// recipient address (<token>@in.<domain>); the sender is matched to a contact,
// and the message is filed on the timeline (unknown senders → Unmatched tray).
export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let sns;
  try { sns = JSON.parse(event.body); } catch { return { statusCode: 400, body: "invalid body" }; }

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN;
  // Only accept messages from our own SES topic (once configured).
  if (expectedTopic && sns.TopicArn && sns.TopicArn !== expectedTopic) {
    return { statusCode: 401, body: "unexpected topic" };
  }

  // SNS subscription handshake: confirm by fetching the SubscribeURL.
  if (sns.Type === "SubscriptionConfirmation" && sns.SubscribeURL) {
    try { await fetch(sns.SubscribeURL); } catch (e) { console.error("SNS confirm failed", e?.message); }
    return { statusCode: 200, body: "subscription confirmed" };
  }
  if (sns.Type !== "Notification") return { statusCode: 200, body: "ignored" };

  let ses;
  try { ses = JSON.parse(sns.Message); } catch { return { statusCode: 200, body: "no SES message" }; }

  const mail = ses.mail || {};
  const ch = mail.commonHeaders || {};
  const toAddr = firstEmail(ses.receipt?.recipients?.[0] || mail.destination?.[0] || ch.to);
  const fromAddr = firstEmail(mail.source || ch.from);
  const subject = (ch.subject || "(no subject)").slice(0, 300);

  // Body comes from the raw MIME if SES included the content.
  let bodyText = "";
  if (ses.content) {
    try {
      const raw = Buffer.from(ses.content, "base64");
      const parsed = await PostalMime.parse(raw);
      bodyText = (parsed.text || parsed.html || "").toString();
    } catch (e) { console.warn("MIME parse failed", e?.message); }
  }

  const token = toAddr ? toAddr.split("@")[0].trim().toLowerCase() : null;
  if (!token) return { statusCode: 200, body: "no recipient token" };

  const { data: estate } = await admin.from("estates").select("id").eq("inbound_token", token).maybeSingle();
  if (!estate) { console.warn("inbound-email: no estate for token", token); return { statusCode: 200, body: "no matching estate" }; }

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
