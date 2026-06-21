import { createClient } from "@supabase/supabase-js";

// Service-role client — used only to verify the caller's identity/role.
const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.SITE_URL || "https://settle-well.netlify.app";
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "noreply@bastroplaundrypro.com";
const FROM_NAME = process.env.BREVO_FROM_NAME || "SettleWell";
const SMS_SENDER = process.env.BREVO_SMS_SENDER || "SettleWell";

// Normalize a US phone number to E.164 (+1XXXXXXXXXX). Best-effort: returns
// null if we can't make sense of it, so we just skip the text.
function toE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (String(raw).trim().startsWith("+")) return `+${digits}`;
  return null;
}

function inviteUrl(email) {
  return `${SITE_URL}/invite?email=${encodeURIComponent(email)}`;
}

// Executor-only: send a sign-up invitation (email + optional SMS) to a person
// who has been added to an estate but hasn't created a login yet.
export const handler = async (event) => {
  let email, name, phone, estateName, existing, estateId;
  try {
    ({ email, name, phone, estateName, existing, estateId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: "email is required" }) };

  // 1. Identify the caller from their bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };

  // 2. Caller must be an administrator/executor on at least one estate
  const { data: roles } = await admin
    .from("estate_users")
    .select("role")
    .eq("auth_user_id", caller.id);
  const isAdmin = (roles || []).some(r => r.role === "administrator" || r.role === "executor");
  if (!isAdmin) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: "BREVO_API_KEY is not configured" }) };

  // Existing logins get a sign-in link; new people get the account-setup link.
  const url = existing ? `${SITE_URL}/login` : inviteUrl(email);
  const who = name || email;
  const estatePhrase = estateName ? `the ${estateName} estate` : "an estate";
  const subject = existing ? "Your SettleWell access link" : "You've been invited to SettleWell";
  const result = { email: null, sms: null };

  // 3. Send the invitation/access email via Brevo's transactional email API
  try {
    const html = existing ? `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#111827">Your SettleWell access link</h2>
        <p>Hi ${who},</p>
        <p>Here's your link to sign in to <strong>${estatePhrase}</strong> on SettleWell:</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Sign in</a>
        </p>
        <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br><a href="${url}">${url}</a></p>
        <p style="font-size:13px;color:#6b7280">Sign in with the email and password you already set up. Forgot it? Ask the executor to reset your password.</p>
      </div>` : `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
        <h2 style="color:#111827">You've been invited to SettleWell</h2>
        <p>Hi ${who},</p>
        <p>You've been given access to <strong>${estatePhrase}</strong> on SettleWell — a private workspace for managing this estate.</p>
        <p>To get started, set up your account:</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Set up my account</a>
        </p>
        <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br><a href="${url}">${url}</a></p>
        <p style="font-size:13px;color:#6b7280">After you choose a password, you'll get a quick "confirm your email" message — click that link and you're in.</p>
      </div>`;
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email, name: name || undefined }],
        subject,
        htmlContent: html,
      }),
    });
    if (resp.ok) result.email = { sent: true };
    else result.email = { sent: false, error: (await resp.text()).slice(0, 300) };
  } catch (e) {
    result.email = { sent: false, error: String(e).slice(0, 300) };
  }

  // 4. Optionally send an SMS via Brevo's transactional SMS API
  const e164 = toE164(phone);
  if (e164) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          type: "transactional",
          sender: SMS_SENDER,
          recipient: e164,
          content: existing
            ? `Your SettleWell sign-in link for ${estateName || "an estate"}: ${url}`
            : `You've been invited to ${estateName || "an estate"} on SettleWell. Set up your account: ${url}`,
        }),
      });
      if (resp.ok) result.sms = { sent: true };
      else result.sms = { sent: false, error: (await resp.text()).slice(0, 300) };
    } catch (e) {
      result.sms = { sent: false, error: String(e).slice(0, 300) };
    }
  } else if (phone) {
    result.sms = { sent: false, error: "phone number not in a recognizable US format" };
  }

  // Capture the invitation on the communications portal (non-fatal).
  if (estateId && (result.email?.sent || result.sms?.sent)) {
    try {
      await admin.from("estate_contact_interactions").insert({
        estate_id: estateId, contact_id: null, direction: "outbound", channel: "email",
        subject, summary: `${existing ? "Sign-in link" : "Invitation"} sent to ${who} (${email})`,
        is_private: false, source: "app", occurred_at: new Date().toISOString(),
      });
    } catch (e) { console.warn("invite interaction log failed:", e?.message); }
  }

  return { statusCode: 200, body: JSON.stringify(result) };
};
