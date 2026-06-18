import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const SMS_SENDER = process.env.BREVO_SMS_SENDER || "SettleWell";
// SMS only goes live once a real (numeric) toll-free sender is configured —
// until the TFN is approved and BREVO_SMS_SENDER is set to that number, this
// job stays dormant and sends nothing.
const SMS_LIVE = /^\+?\d{6,}$/.test(SMS_SENDER.replace(/[\s-]/g, ""));

function toE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^\d]/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (String(raw).trim().startsWith("+")) return `+${d}`;
  return null;
}

async function sendSms(to, content) {
  const resp = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ type: "transactional", sender: SMS_SENDER, recipient: to, content }),
  });
  return resp.ok;
}

// Scheduled: text the executor a reminder for meetings happening soon.
export default async () => {
  if (!SMS_LIVE || !process.env.BREVO_API_KEY) {
    console.log("notify-sweep dormant — no numeric SMS sender (toll-free number) configured yet.");
    return new Response("dormant");
  }
  const now = new Date();
  const until = new Date(now.getTime() + 28 * 3600 * 1000).toISOString();
  const { data: meetings } = await admin.from("estate_meetings")
    .select("id, estate_id, contact_name, meeting_type, scheduled_at")
    .eq("status", "scheduled").is("reminder_sent_at", null)
    .gte("scheduled_at", now.toISOString()).lte("scheduled_at", until);

  let sent = 0;
  for (const m of meetings ?? []) {
    const [{ data: admins }, { data: est }] = await Promise.all([
      admin.from("estate_users").select("phone").eq("estate_id", m.estate_id).in("role", ["administrator", "executor"]),
      admin.from("estates").select("deceased_name").eq("id", m.estate_id).single(),
    ]);
    const phone = (admins || []).map(a => a.phone).find(Boolean);
    const e164 = toE164(phone);
    if (e164) {
      const when = new Date(m.scheduled_at).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      try {
        if (await sendSms(e164, `SettleWell: reminder — ${(m.meeting_type || "meeting").replace(/_/g, " ")} with ${m.contact_name || "a contact"} (${est?.deceased_name || "estate"}) on ${when}. Reply STOP to opt out.`)) sent++;
      } catch (e) { console.warn("reminder SMS failed", m.id, e?.message); }
    }
    // Mark handled regardless, so we don't retry a meeting with no phone forever.
    await admin.from("estate_meetings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", m.id);
  }
  console.log(`notify-sweep: ${sent} reminder(s) sent.`);
  return new Response(`sent ${sent}`);
};

export const config = { schedule: "0 13 * * *" };
