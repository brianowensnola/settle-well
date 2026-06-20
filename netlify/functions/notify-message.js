import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FROM_EMAIL = process.env.ESTATE_FROM_EMAIL || "estates@settlewellestate.com";
const SITE_URL = process.env.SITE_URL || "https://settle-well.netlify.app";
const SMS_SENDER = process.env.BREVO_SMS_SENDER;

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (String(raw).trim().startsWith("+")) return `+${d}`;
  return null;
}

// Notify the other members of an estate that a new in-app message was posted.
// Callable by any member of the estate. Best-effort — never blocks the message.
export const handler = async (event) => {
  let estateId, messageId;
  try { ({ estateId, messageId } = JSON.parse(event.body)); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }
  if (!estateId || !messageId) return { statusCode: 400, body: JSON.stringify({ error: "estateId and messageId required" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (cErr || !caller) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };

  // Caller must belong to this estate.
  const { data: myRows } = await admin.from("estate_users").select("role").eq("auth_user_id", caller.id).eq("estate_id", estateId);
  if (!myRows?.length) return { statusCode: 403, body: JSON.stringify({ error: "not a member of this estate" }) };

  const { data: message } = await admin.from("estate_messages").select("body, author_name, author_user_id, is_private").eq("id", messageId).single();
  if (!message || message.is_private) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) }; // private notes don't notify

  const { data: estate } = await admin.from("estates").select("deceased_name").eq("id", estateId).single();
  const estateName = estate?.deceased_name ? `${estate.deceased_name} estate` : "estate";
  const author = message.author_name || "Someone";
  const snippet = (message.body || "").slice(0, 240) + ((message.body || "").length > 240 ? "…" : "");

  // Recipients: everyone with message access on the estate, except the author.
  const { data: members } = await admin.from("estate_users")
    .select("name, email, phone, sms_consent, auth_user_id, role")
    .eq("estate_id", estateId)
    .in("role", ["administrator", "executor", "heir", "collaborator"]);
  const recipients = (members || []).filter(m => m.auth_user_id !== caller.id);

  const apiKey = process.env.BREVO_API_KEY;
  let notified = 0;
  const subject = `New message — ${estateName}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
    <p><strong>${escapeHtml(author)}</strong> posted a new message in the ${escapeHtml(estateName)}:</p>
    <blockquote style="border-left:3px solid #e5e7eb;margin:8px 0;padding:4px 12px;color:#374151">${escapeHtml(snippet).replace(/\n/g, "<br>")}</blockquote>
    <p style="margin-top:14px"><a href="${SITE_URL}/messages" style="color:#2563eb">Open SettleWell to read &amp; reply &rarr;</a></p>
  </div>`;

  if (apiKey) {
    for (const r of recipients) {
      if (r.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) {
        try {
          const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              sender: { name: "SettleWell", email: FROM_EMAIL },
              to: [{ email: r.email, name: r.name || undefined }],
              subject,
              htmlContent: html,
              textContent: `${author} posted a new message in the ${estateName}:\n\n${snippet}\n\nOpen SettleWell to read & reply: ${SITE_URL}/messages`,
            }),
          });
          if (resp.ok) notified++;
        } catch (e) { console.error("notify-message email error:", e); }
      }
      if (SMS_SENDER && r.sms_consent) {
        const phone = toE164(r.phone);
        if (phone) {
          try {
            await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
              method: "POST",
              headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ sender: SMS_SENDER, recipient: phone, content: `New message in the ${estateName} from ${author}. Open SettleWell: ${SITE_URL}/messages`, type: "transactional" }),
            });
          } catch (e) { console.error("notify-message sms error:", e); }
        }
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ notified }) };
};
