import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

function friendlyAiError(e) {
  const m = (e?.message || String(e) || "").toLowerCase();
  if (m.includes("credit balance") || m.includes("billing") || m.includes("quota") || m.includes("payment"))
    return "The AI assistant is temporarily unavailable. Please try again later.";
  if (m.includes("overloaded") || m.includes("rate limit") || m.includes("429") || m.includes("529"))
    return "The AI assistant is busy right now. Please try again in a moment.";
  return "The AI assistant is temporarily unavailable. Please try again shortly.";
}
function jsonFrom(text) { const m = text.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : text); }

// What each intent should ask the model to produce. Keep these as plain-English
// goals; the model fills in specifics from the estate context + the executor's
// extra instruction.
const INTENTS = {
  attorney_status: "a short, polite status / follow-up email to the estate's attorney asking where things stand and what is needed next from the executor",
  bank_balances: "an email to a bank/financial institution requesting the date-of-death balance(s) and the steps to claim or transfer the account for the estate",
  payoff: "an email to a lender requesting the current payoff balance (as of the date of death) on a loan/mortgage and how the estate should remit payment",
  insurance_claim: "an email to an insurance company asking how to file a claim/benefit for the deceased and what documentation they require",
  cancel_service: "a brief email to a company asking to cancel a service/subscription for the deceased and requesting any prorated refund",
  records_request: "an email requesting specific records or documents the estate needs (statements, policies, titles, etc.)",
  general: "a clear, professional email accomplishing what the executor describes",
};

// Draft an estate email. Suggestion only — the executor edits and approves
// before anything is sent. Executor-gated (uses AI credits + acts as the estate).
export const handler = async (event) => {
  let estateId, contactName, contactRole, intent, instruction;
  try {
    ({ estateId, contactName, contactRole, intent = "general", instruction = "" } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId) return { statusCode: 400, body: JSON.stringify({ error: "estateId required" }) };

  // Auth: caller must be an executor/administrator.
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role").eq("auth_user_id", callerData.user.id).eq("estate_id", estateId);
  const isExec = (roles || []).some(r => r.role === "administrator" || r.role === "executor");
  if (!isExec) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const { data: estate } = await admin.from("estates")
      .select("deceased_name, state_of_residence, administrator_name").eq("id", estateId).single();
    const goal = INTENTS[intent] || INTENTS.general;

    const prompt = `You are helping the executor of an estate write ${goal}.

ESTATE: ${estate?.deceased_name || "the deceased"} (deceased). State: ${estate?.state_of_residence || "unknown"}.
EXECUTOR (the sender): ${estate?.administrator_name || "the Executor"}.
RECIPIENT: ${contactName || "the recipient"}${contactRole ? ` (${contactRole})` : ""}.
${instruction ? `EXECUTOR'S SPECIFIC INSTRUCTION: ${instruction}` : ""}

Write a professional, warm-but-businesslike email the executor can send. Be concise and specific. Refer to ${estate?.deceased_name || "the deceased"} respectfully (e.g. "the estate of ${estate?.deceased_name || "the deceased"}"). Do NOT invent account numbers, dollar amounts, dates, or facts you weren't given — use a clearly bracketed placeholder like [account number] when something specific is needed so the executor can fill it in. Sign as ${estate?.administrator_name || "the Executor"}, Executor of the Estate of ${estate?.deceased_name || "the deceased"}. This is correspondence assistance, not legal advice; do not give legal opinions.

Return ONLY JSON: {"subject":"...","body":"the full email body as plain text with line breaks"}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content?.[0]?.type === "text" ? resp.content[0].text : "";
    const parsed = jsonFrom(text);
    return { statusCode: 200, body: JSON.stringify({ subject: parsed.subject || "", body: parsed.body || "" }) };
  } catch (e) {
    console.error("draft-email error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
