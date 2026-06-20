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
  attorney_question: "a clear email to the estate's attorney asking a specific question about the probate/administration process",
  attorney_send: "a brief cover email to the estate's attorney accompanying information or documents they requested",
  bank_balances: "an email to a bank/financial institution requesting the date-of-death balance(s) and the steps to claim or transfer the account for the estate",
  bank_statements: "an email to a bank/financial institution requesting account statements for the estate's records",
  bank_notify: "an email notifying a bank/financial institution of the death, asking them to secure/freeze the account, and explain the next steps for the estate",
  bank_close: "an email to a bank asking how to close the account or transfer the funds into the estate account",
  payoff: "an email to a lender requesting the current payoff balance (as of the date of death) on a loan/mortgage and how the estate should remit payment",
  lender_statements: "an email to a lender requesting current loan details and recent statements",
  insurance_claim: "an email to an insurance company asking how to file a claim/benefit for the deceased and what documentation they require",
  insurance_info: "an email to an insurance company requesting policy details — coverage, named beneficiaries, and current status",
  insurance_cancel: "a brief email asking to cancel an insurance policy that is no longer needed and requesting any prorated refund",
  employer: "an email to the deceased's employer asking about final pay, accrued PTO, benefits, and any employer-provided life insurance",
  creditor_notify: "an email notifying a creditor or credit-card company of the death and requesting the current balance and how claims against the estate are handled",
  utility_cancel: "a brief email asking to cancel a utility or subscription for the deceased and requesting any final refund",
  utility_transfer: "an email asking to transfer or update a utility/service account to the estate or executor while the property is being handled",
  final_bill: "an email requesting a final bill or the current balance on an account",
  refund_deposit: "an email requesting a refund or the return of a deposit owed to the deceased or the estate",
  govt_inquiry: "a clear, respectful email to a government agency making an inquiry or asking about benefits or requirements relevant to the estate",
  realtor: "an email to a real estate agent or appraiser inquiring about valuing or selling estate property",
  hoa_notify: "an email notifying an HOA or property manager of the death and asking about dues, rules, and any required notices",
  business: "an email notifying business partners or associates of the death and/or requesting business records relevant to the estate",
  records_request: "an email requesting specific records or documents the estate needs (statements, policies, titles, etc.)",
  cancel_service: "a brief email to a company asking to cancel a service/subscription for the deceased and requesting any prorated refund",
  heir_update: "a warm, clear, factual update email to an heir/beneficiary on the status of the estate (reassuring, not legal advice)",
  thank_you: "a brief, gracious thank-you / acknowledgment email",
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
      .select("deceased_name, state_of_residence, administrator_name, administrator_phone, administrator_email, inbound_token").eq("id", estateId).single();
    const goal = INTENTS[intent] || INTENTS.general;

    // Reply email = the estate's own inbox (where replies are captured) when
    // inbound receiving is live, else the executor's email on file. Phone comes
    // from the Executor section. Real values so the draft never placeholders them.
    const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN;
    const replyEmail = (INBOUND_DOMAIN && estate?.inbound_token)
      ? `${estate.inbound_token}@${INBOUND_DOMAIN}`
      : (estate?.administrator_email || "");
    const replyPhone = estate?.administrator_phone || "";
    const contactLines = [
      replyEmail ? `- email: ${replyEmail}` : null,
      replyPhone ? `- phone: ${replyPhone}` : null,
    ].filter(Boolean).join("\n");

    const prompt = `You are helping the executor of an estate write ${goal}.

ESTATE: ${estate?.deceased_name || "the deceased"} (deceased). State: ${estate?.state_of_residence || "unknown"}.
EXECUTOR (the sender): ${estate?.administrator_name || "the Executor"}.
EXECUTOR CONTACT DETAILS (use these REAL values when offering contact info — never placeholders):
${contactLines || "(none on file — do NOT invent or bracket contact details; simply omit them)"}
RECIPIENT NAME: ${contactName || "(unknown)"}${contactRole ? ` — role: ${contactRole}` : ""}.
${instruction ? `EXECUTOR'S SPECIFIC INSTRUCTION: ${instruction}` : ""}

Write a professional, warm-but-businesslike email the executor can send. Be concise and specific.
SALUTATION: Open by addressing the recipient by the RECIPIENT NAME above. If it is a person's name, greet them by first name (e.g. "Dear Melissa,"). If it is a firm or organization, greet appropriately (e.g. "Dear Cotts Law Firm Team,"). You already have the recipient's name — NEVER write a placeholder such as [Attorney Name], [Recipient], or [Name] for it. ${contactName ? "" : "If the recipient name is unknown, use a neutral greeting such as \"Dear Sir or Madam,\". "}
Refer to ${estate?.deceased_name || "the deceased"} respectfully (e.g. "the estate of ${estate?.deceased_name || "the deceased"}"). Do NOT invent account numbers, dollar amounts, dates, or facts you weren't given — use a clearly bracketed placeholder like [account number] ONLY for such missing factual details (never for the recipient's name, and never for the executor's own email/phone — use the EXECUTOR CONTACT DETAILS above) so the executor can fill it in. When offering a way to reach the executor, use the real email/phone listed above; if a detail isn't listed, just leave it out. Sign as ${estate?.administrator_name || "the Executor"}, Executor of the Estate of ${estate?.deceased_name || "the deceased"}. This is correspondence assistance, not legal advice; do not give legal opinions.

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
