import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

const PHASES = [
  "Phase 1 — Immediate", "Phase 2 — First Week", "Phase 3 — Government Notifications",
  "Phase 4 — Financial Accounts", "Phase 5 — Insurance", "Phase 6 — Real Estate & Property",
  "Phase 7 — Debts & Liabilities", "Phase 8 — Business Interests", "Phase 9 — Digital Assets",
  "Phase 10 — Taxes", "Phase 11 — Commonly Missed Items",
];

function jsonFrom(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

// Synchronous: read ONE note and return any concrete follow-up actions it
// implies that should become tasks. Suggest-and-confirm — the caller decides
// whether to create each one.
export const handler = async (event) => {
  let estateId, content;
  try {
    ({ estateId, content } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !content || !content.trim()) {
    return { statusCode: 200, body: JSON.stringify({ tasks: [] }) };
  }

  try {
    const { data: estate } = await supabase
      .from("estates").select("deceased_name, state_of_residence").eq("id", estateId).single();

    // Existing task texts so we don't suggest something already on the list.
    const { data: existing } = await supabase
      .from("estate_tasks").select("text").eq("estate_id", estateId);
    const existingList = (existing ?? []).map(t => `- ${t.text}`).join("\n") || "(none)";

    const prompt = `You are an estate-administration assistant. An executor just wrote the note below. Extract ONLY concrete follow-up ACTIONS the note implies that are not already covered by an existing task — things like "call the attorney back", "send the form to the bank", "follow up on the insurance claim". Do not invent tasks the note doesn't support. If the note is purely a record of something already done or has no actionable follow-up, return an empty list.

ESTATE: ${estate?.deceased_name || "the deceased"}; State: ${estate?.state_of_residence || "unknown"}. This is assistance, not legal advice.

EXISTING TASKS (do not duplicate):
${existingList}

NOTE:
"""
${content.slice(0, 4000)}
"""

Return ONLY JSON: {"tasks":[{"text":"short actionable task","detail":"one sentence of context from the note","phase":"one of: ${PHASES.join(" | ")}"}]}
Return at most 3 tasks. Prefer zero over a weak guess.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const parsed = jsonFrom(text);
    const tasks = (parsed.tasks || []).slice(0, 3).map(t => ({
      text: t.text,
      detail: t.detail || null,
      phase: PHASES.includes(t.phase) ? t.phase : "Phase 11 — Commonly Missed Items",
    })).filter(t => t.text && t.text.trim());

    return { statusCode: 200, body: JSON.stringify({ tasks }) };
  } catch (e) {
    console.error("note-to-tasks error:", e);
    // Non-fatal: saving the note already succeeded; just return no suggestions.
    return { statusCode: 200, body: JSON.stringify({ tasks: [], error: e.message }) };
  }
};
