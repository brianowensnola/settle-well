import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FROM_EMAIL = process.env.ESTATE_FROM_EMAIL || "estates@settlewellestate.com";
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

// Notify the contact a task is assigned to (email now; SMS when a sender is set)
// and record it on the communications timeline. Executor-gated. Manual action.
export const handler = async (event) => {
  let taskId, channels, message;
  try { ({ taskId, channels = ["email"], message = "" } = JSON.parse(event.body)); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }
  if (!taskId) return { statusCode: 400, body: JSON.stringify({ error: "taskId required" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (cErr || !caller) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };

  const { data: task } = await admin.from("estate_tasks")
    .select("id, text, detail, estate_id, assigned_contact_id").eq("id", taskId).single();
  if (!task) return { statusCode: 404, body: JSON.stringify({ error: "task not found" }) };

  const { data: roles } = await admin.from("estate_users").select("role").eq("auth_user_id", caller.id).eq("estate_id", task.estate_id);
  if (!(roles || []).some(r => r.role === "administrator" || r.role === "executor"))
    return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };
  if (!task.assigned_contact_id) return { statusCode: 400, body: JSON.stringify({ error: "this task isn't assigned to a contact" }) };

  const { data: contact } = await admin.from("estate_contacts").select("name, email, emails, phone").eq("id", task.assigned_contact_id).single();
  const toEmail = contact?.email || (Array.isArray(contact?.emails) ? contact.emails[0] : null);

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY is not configured" }) };

  const { data: estate } = await admin.from("estates").select("deceased_name, inbound_token").eq("id", task.estate_id).single();
  const estateName = estate?.deceased_name ? `Estate of ${estate.deceased_name}` : "Estate";
  const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.settlewellestate.com";
  const replyTo = estate?.inbound_token ? { email: `${estate.inbound_token}@${INBOUND_DOMAIN}`, name: estateName } : (caller.email ? { email: caller.email } : undefined);

  const first = contact?.name ? ` ${contact.name.split(" ")[0]}` : "";
  const isQuestion = !!(message && message.trim());
  const subject = isQuestion
    ? `Question about the ${estate?.deceased_name || ""} estate: ${task.text}`.trim()
    : `Task for the ${estate?.deceased_name || ""} estate: ${task.text}`.trim();
  const bodyText = isQuestion
    ? `Hello${first},\n\nThis is regarding the ${estateName} (task: "${task.text}").\n\n${message.trim()}\n\nPlease reply to this email. Thank you.`
    : `Hello${first},\n\nThis is regarding the ${estateName}. We'd like your help with the following:\n\n${task.text}${task.detail ? `\n\n${task.detail}` : ""}\n\nPlease reply to this email with any questions or once it's handled. Thank you.`;
  const html = isQuestion
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
        <p>Hello${escapeHtml(first)},</p>
        <p>This is regarding the ${escapeHtml(estateName)} (task: &ldquo;${escapeHtml(task.text)}&rdquo;).</p>
        <p>${escapeHtml(message.trim()).replace(/\n/g, "<br>")}</p>
        <p>Please reply to this email. Thank you.</p>
      </div>`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
        <p>Hello${escapeHtml(first)},</p>
        <p>This is regarding the ${escapeHtml(estateName)}. We'd like your help with the following:</p>
        <p style="font-weight:600">${escapeHtml(task.text)}</p>
        ${task.detail ? `<p>${escapeHtml(task.detail).replace(/\n/g, "<br>")}</p>` : ""}
        <p>Please reply to this email with any questions or once it's handled. Thank you.</p>
      </div>`;

  let emailed = false, texted = false;
  if (channels.includes("email") && toEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: `${estateName} (via SettleWell)`, email: FROM_EMAIL },
          replyTo,
          to: [{ email: toEmail, name: contact?.name || undefined }],
          subject, htmlContent: html, textContent: bodyText,
        }),
      });
      if (resp.ok) emailed = true;
      else { console.error("notify-assignee email failed:", resp.status, await resp.text()); return { statusCode: 502, body: JSON.stringify({ error: "The email couldn't be sent." }) }; }
    } catch (e) { console.error("notify-assignee error:", e); return { statusCode: 500, body: JSON.stringify({ error: "The email couldn't be sent." }) }; }
  } else if (channels.includes("email")) {
    return { statusCode: 400, body: JSON.stringify({ error: "that contact has no email on file" }) };
  }

  if (channels.includes("sms") && SMS_SENDER && contact?.phone) {
    const phone = toE164(contact.phone);
    if (phone) {
      try {
        const resp = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sender: SMS_SENDER, recipient: phone, content: isQuestion ? `${estateName}: ${message.trim().slice(0, 280)}` : `${estateName}: we'd like your help with — ${task.text}. We'll follow up by email.`, type: "transactional" }),
        });
        if (resp.ok) texted = true;
      } catch (e) { console.error("notify-assignee sms error:", e); }
    }
  }

  // Capture on the communications timeline.
  try {
    await admin.from("estate_contact_interactions").insert({
      estate_id: task.estate_id, contact_id: task.assigned_contact_id, direction: "outbound", channel: "email",
      subject, summary: isQuestion ? `Question to contact${toEmail ? ` (${toEmail})` : ""}: ${message.trim().slice(0, 200)}` : `Task assigned & notified${toEmail ? ` (${toEmail})` : ""}: ${task.text}`,
      body: bodyText, is_private: false, source: "app", occurred_at: new Date().toISOString(),
    });
  } catch (logErr) { console.warn("assignee interaction log failed:", logErr?.message); }

  return { statusCode: 200, body: JSON.stringify({ success: true, to: toEmail, emailed, texted }) };
};
