import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FROM_EMAIL = process.env.ESTATE_FROM_EMAIL || "estates@settlewellestate.com";
const SITE_URL = process.env.SITE_URL || "https://settle-well.netlify.app";
const SMS_SENDER = process.env.BREVO_SMS_SENDER; // set once the toll-free number clears

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

// Send an update/notice TO the estate's heirs (email now; SMS when a sender is
// configured) and record it as proof in estate_heir_notice_log. Executor-gated.
export const handler = async (event) => {
  let estateId, noticeType, title, body, recipientIds, channels;
  try {
    ({ estateId, noticeType = "progress_update", title = "", body = "", recipientIds = null, channels = ["email"] } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !body.trim()) return { statusCode: 400, body: JSON.stringify({ error: "estateId and body are required" }) };

  // Auth: caller must be an executor on this estate.
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role").eq("auth_user_id", caller.id).eq("estate_id", estateId);
  const isExec = (roles || []).some(r => r.role === "administrator" || r.role === "executor");
  if (!isExec) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY is not configured" }) };

  // Resolve heir recipients (heirs/observers with contact info). If specific
  // recipientIds are given, target only those.
  let q = admin.from("estate_users").select("id, name, email, phone, sms_consent, role").eq("estate_id", estateId).in("role", ["heir", "observer"]);
  if (Array.isArray(recipientIds) && recipientIds.length) q = q.in("id", recipientIds);
  const { data: heirs } = await q;
  const list = (heirs || []);

  const { data: estate } = await admin.from("estates").select("deceased_name, inbound_token").eq("id", estateId).single();
  const estateName = estate?.deceased_name ? `Estate of ${estate.deceased_name}` : "Estate";
  const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.settlewellestate.com";
  const replyTo = (INBOUND_DOMAIN && estate?.inbound_token)
    ? { email: `${estate.inbound_token}@${INBOUND_DOMAIN}`, name: estateName }
    : (caller.email ? { email: caller.email } : undefined);
  const subject = title?.trim() || `Update on the ${estate?.deceased_name || ""} estate`.trim();
  const portalLine = `\n\nYou can view the full estate update and details any time here: ${SITE_URL}/dashboard`;
  const fullText = `${body}${portalLine}`;
  const htmlContent = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
    ${escapeHtml(body).replace(/\n/g, "<br>")}
    <p style="margin-top:18px"><a href="${SITE_URL}/dashboard" style="color:#2563eb">View the full estate update &amp; details &rarr;</a></p>
    <p style="margin-top:14px;font-size:12px;color:#9ca3af">You're receiving this as a beneficiary of the ${escapeHtml(estate?.deceased_name || "")} estate. Sent via SettleWell.</p>
  </div>`;

  const wantEmail = channels.includes("email");
  const wantSms = channels.includes("sms") && !!SMS_SENDER;
  const recipients = [];
  let emailed = 0, texted = 0;

  for (const h of list) {
    const rec = { heir_id: h.id, name: h.name || null, email: h.email || null, emailed: false, texted: false };
    if (wantEmail && h.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(h.email)) {
      try {
        const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sender: { name: `${estateName} (via SettleWell)`, email: FROM_EMAIL },
            replyTo,
            to: [{ email: h.email, name: h.name || undefined }],
            subject,
            htmlContent,
            textContent: fullText,
          }),
        });
        if (resp.ok) { rec.emailed = true; emailed++; }
        else console.error("notify-heirs email failed:", h.email, resp.status, await resp.text());
      } catch (e) { console.error("notify-heirs email error:", e); }
    }
    if (wantSms && h.sms_consent) {
      const phone = toE164(h.phone);
      if (phone) {
        try {
          const resp = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
            method: "POST",
            headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              sender: SMS_SENDER,
              recipient: phone,
              content: `${estateName}: ${title?.trim() || "New update"}. Open SettleWell to read it: ${SITE_URL}/dashboard`,
              type: "transactional",
            }),
          });
          if (resp.ok) { rec.texted = true; texted++; }
          else console.error("notify-heirs sms failed:", phone, resp.status, await resp.text());
        } catch (e) { console.error("notify-heirs sms error:", e); }
      }
    }
    recipients.push(rec);
  }

  // Record proof of the communication, even if some channels were unavailable.
  const { data: logged } = await admin.from("estate_heir_notice_log").insert({
    estate_id: estateId,
    notice_type: noticeType,
    title: subject,
    body,
    channels,
    recipients,
    sent_by: caller.id,
  }).select().single();

  return { statusCode: 200, body: JSON.stringify({ success: true, emailed, texted, recipients, log: logged || null }) };
};
