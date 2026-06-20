import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Estate email is branded as SettleWell (settlewellestate.com is authenticated
// in Brevo). The From address need not be a real mailbox — replies go to
// reply-to. Overridable via env if the address ever changes.
const FROM_EMAIL = process.env.ESTATE_FROM_EMAIL || "estates@settlewellestate.com";

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Turn "a@x.com, b@y.com" into Brevo's [{email}] array (valid addresses only).
function addrList(raw) {
  return String(raw || "")
    .split(/[,;]+/).map(s => s.trim())
    .filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s))
    .map(email => ({ email }));
}

// Send an estate email through Brevo, on behalf of the estate, and capture it on
// the recipient contact's communications timeline. Executor-gated.
export const handler = async (event) => {
  let estateId, contactId, to, cc, bcc, subject, body, isPrivate;
  try {
    ({ estateId, contactId, to, cc, bcc, subject, body, isPrivate = false } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !to || !subject || !body) {
    return { statusCode: 400, body: JSON.stringify({ error: "estateId, to, subject, and body are required" }) };
  }

  // Auth: caller must be an executor/administrator on this estate.
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

  const { data: estate } = await admin.from("estates").select("deceased_name, inbound_token").eq("id", estateId).single();
  const estateName = estate?.deceased_name ? `Estate of ${estate.deceased_name}` : "Estate";
  // Replies go to the estate's own inbox once inbound receiving is live — that's
  // signalled by setting the INBOUND_EMAIL_DOMAIN env var (done when SES is up).
  // Until then, replies go to the executor so nothing bounces or is lost.
  const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "in.settlewellestate.com";
  const replyTo = (INBOUND_DOMAIN && estate?.inbound_token)
    ? { email: `${estate.inbound_token}@${INBOUND_DOMAIN}`, name: estateName }
    : (caller.email ? { email: caller.email } : undefined);
  const htmlContent = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;
  const ccList = addrList(cc);
  const bccList = addrList(bcc);

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: `${estateName} (via SettleWell)`, email: FROM_EMAIL },
        replyTo,
        to: [{ email: to }],
        ...(ccList.length ? { cc: ccList } : {}),
        ...(bccList.length ? { bcc: bccList } : {}),
        subject,
        htmlContent,
        textContent: body,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("Brevo send failed:", resp.status, detail);
      return { statusCode: 502, body: JSON.stringify({ error: "The email couldn't be sent. Please try again." }) };
    }

    // Capture it on the contact's communications timeline.
    const { data: logged } = await admin.from("estate_contact_interactions").insert({
      estate_id: estateId,
      contact_id: contactId || null,
      direction: "outbound",
      channel: "email",
      subject,
      summary: `To ${to}${ccList.length ? ` (cc: ${ccList.map(c => c.email).join(", ")})` : ""}: ${body.slice(0, 280)}${body.length > 280 ? "…" : ""}`,
      body,
      is_private: !!isPrivate,
      source: "app",
      occurred_at: new Date().toISOString(),
    }).select().single();

    return { statusCode: 200, body: JSON.stringify({ success: true, interaction: logged || null }) };
  } catch (e) {
    console.error("send-estate-email error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: "The email couldn't be sent. Please try again." }) };
  }
};
