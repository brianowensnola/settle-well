import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

// Draft a formal death-notification letter for a recipient, pre-filled from the
// estate's data. Executor-only. Returns the letter text for the executor to
// review, edit, and send.
export const handler = async (event) => {
  let estateId, recipientName, recipientType, recipientAddress, notes;
  try {
    ({ estateId, recipientName, recipientType, recipientAddress, notes } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !recipientName) {
    return { statusCode: 400, body: JSON.stringify({ error: "estateId and recipientName required" }) };
  }

  // Caller must be an executor/administrator
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", callerData.user.id);
  const isAdminHere = (roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor"));
  if (!isAdminHere) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const { data: estate } = await admin.from("estates").select("*").eq("id", estateId).single();
    if (!estate) throw new Error("estate not found");

    const prompt = `Write a formal, professional letter notifying an organization of a death, on behalf of the estate's executor. Keep it concise, respectful, and businesslike.

DECEASED: ${estate.deceased_name || "[deceased name]"}${estate.deceased_dob ? `, born ${estate.deceased_dob}` : ""}${estate.deceased_dod ? `, died ${estate.deceased_dod}` : ""}.
STATE OF RESIDENCE: ${estate.state_of_residence || "[state]"}.
EXECUTOR (sender): ${estate.administrator_name || "[executor name]"}${estate.administrator_phone ? `, phone ${estate.administrator_phone}` : ""}${estate.administrator_email ? `, email ${estate.administrator_email}` : ""}.

RECIPIENT: ${recipientName}${recipientType ? ` (type: ${recipientType})` : ""}${recipientAddress ? `\nRECIPIENT ADDRESS: ${recipientAddress}` : ""}.
${notes ? `EXECUTOR NOTES / SPECIFICS: ${notes}` : ""}

Tailor the request to the recipient type:
- government (SSA/IRS/DMV/etc.): notify of death, ask them to update records / stop benefits or payments, and ask what they require from the estate.
- credit_bureau: request a deceased flag/notation be placed on the file to prevent identity theft.
- financial (bank/lender/brokerage): notify of death, ask for date-of-death balances/statements and the process to settle or transfer the account.
- insurance: notify of death and ask about claims, beneficiaries, and cancellation/refund of premiums.
- utility / subscription: request cancellation or transfer effective the appropriate date.
- pension/benefits: notify of death and ask about survivor benefits and stopping payments.
- other: a general, courteous death notification asking how to proceed.

Use clearly-marked placeholders in [BRACKETS] for any sensitive detail not provided (e.g. [SSN], [ACCOUNT NUMBER], [POLICY NUMBER]). Mention that a certified copy of the death certificate is enclosed/available on request. Include a today's-date line as [DATE], a proper salutation, body, and a sign-off with the executor's name and contact info. Return ONLY the letter text — no preamble or commentary.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const letter = resp.content[0].type === "text" ? resp.content[0].text : "";
    return { statusCode: 200, body: JSON.stringify({ letter }) };
  } catch (e) {
    console.error("death-notice error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "draft failed" }) };
  }
};
