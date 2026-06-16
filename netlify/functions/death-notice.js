import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

// Map raw AI/API errors to a calm, user-facing message (real error stays in logs).
function friendlyAiError(e) {
  const m = (e?.message || String(e) || "").toLowerCase();
  if (m.includes("credit balance") || m.includes("billing") || m.includes("quota") || m.includes("payment"))
    return "The AI assistant is temporarily unavailable. Please try again later.";
  if (m.includes("overloaded") || m.includes("rate limit") || m.includes("429") || m.includes("529"))
    return "The AI assistant is busy right now. Please try again in a moment.";
  return "The AI assistant is temporarily unavailable. Please try again shortly.";
}

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

    const addressInstruction = recipientAddress
      ? `Use this recipient mailing address exactly as given: ${recipientAddress}`
      : `First, look up the CURRENT official mailing address for sending a death notification to "${recipientName}"${estate.state_of_residence ? ` (state of residence: ${estate.state_of_residence})` : ""}. Prefer the organization's own official website as the source. If you cannot find a reliable address, write "[VERIFY MAILING ADDRESS — see the recipient's official website]" instead of guessing — never invent an address.`;

    const prompt = `Write a formal, professional letter notifying an organization of a death, on behalf of the estate's executor. Keep it concise, respectful, and businesslike.

DECEASED: ${estate.deceased_name || "[deceased name]"}${estate.deceased_dob ? `, born ${estate.deceased_dob}` : ""}${estate.deceased_dod ? `, died ${estate.deceased_dod}` : ""}.
STATE OF RESIDENCE: ${estate.state_of_residence || "[state]"}.
EXECUTOR (sender): ${estate.administrator_name || "[executor name]"}${estate.administrator_phone ? `, phone ${estate.administrator_phone}` : ""}${estate.administrator_email ? `, email ${estate.administrator_email}` : ""}.

RECIPIENT: ${recipientName}${recipientType ? ` (type: ${recipientType})` : ""}.
ADDRESS: ${addressInstruction}
${notes ? `EXECUTOR NOTES / SPECIFICS: ${notes}` : ""}

Tailor the request to the recipient type:
- government (SSA/IRS/DMV/etc.): notify of death, ask them to update records / stop benefits or payments, and ask what they require from the estate.
- credit_bureau: request a deceased flag/notation be placed on the file to prevent identity theft.
- financial (bank/lender/brokerage): notify of death, ask for date-of-death balances/statements and the process to settle or transfer the account.
- insurance: notify of death and ask about claims, beneficiaries, and cancellation/refund of premiums.
- utility / subscription: request cancellation or transfer effective the appropriate date.
- pension/benefits: notify of death and ask about survivor benefits and stopping payments.
- other: a general, courteous death notification asking how to proceed.

Use clearly-marked placeholders in [BRACKETS] for any sensitive detail not provided (e.g. [SSN], [ACCOUNT NUMBER], [POLICY NUMBER]). Mention that a certified copy of the death certificate is enclosed/available on request. Include a today's-date line as [DATE], a proper salutation (with the looked-up recipient address block), body, and a sign-off with the executor's name and contact info.

Output the letter text, then on a new line "===SOURCES===" followed by the URL(s) you used to find/verify the mailing address (or "none" if an address was provided to you). No other commentary.`;

    const messages = [{ role: "user", content: prompt }];
    let resp;
    try {
      // Let Claude actually look up the current address and cite it.
      resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000, messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      });
    } catch (toolErr) {
      // Web search unavailable — draft without it, never guessing the address.
      console.warn("web search unavailable, drafting without lookup:", toolErr?.message);
      resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 2000,
        messages: [{ role: "user", content: prompt + "\n\n(You do NOT have web access — do not guess an address; use the [VERIFY MAILING ADDRESS] placeholder.)" }],
      });
    }

    const full = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    const [letterPart, sourcePart] = full.split(/===SOURCES===/i);
    const letter = (letterPart || full).trim();
    const sources = (sourcePart || "").trim();
    return { statusCode: 200, body: JSON.stringify({ letter, sources }) };
  } catch (e) {
    console.error("death-notice error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
