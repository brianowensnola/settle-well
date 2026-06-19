import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
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

function jsonFrom(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

// Suggest where a new task belongs: which phase, and (optionally) which existing
// task it should be nested under as a sub-task. Suggestion only — the caller
// pre-fills the form and the user confirms or overrides before anything saves.
export const handler = async (event) => {
  let estateId, text, detail;
  try {
    ({ estateId, text, detail } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !text || !text.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: "estateId and text required" }) };
  }

  try {
    const [estateRes, secRes, taskRes] = await Promise.all([
      supabase.from("estates").select("deceased_name, state_of_residence").eq("id", estateId).single(),
      supabase.from("estate_sections").select("id, label").eq("estate_id", estateId).order("sort_order"),
      // Existing top-level tasks are the candidate parents for nesting.
      supabase.from("estate_tasks").select("id, text, section_id, status").eq("estate_id", estateId).is("parent_task_id", null),
    ]);
    const estate = estateRes.data;
    const sections = secRes.data ?? [];
    const tasks = taskRes.data ?? [];
    if (sections.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ phase: null, parent_task_id: null, parent_text: null, reason: "" }) };
    }
    const secLabel = Object.fromEntries(sections.map(s => [s.id, s.label]));
    const phases = sections.map(s => s.label);
    const taskList = tasks.map(t => `${t.id} | [${secLabel[t.section_id] ?? "?"}] ${t.text} (${t.status})`).join("\n") || "(none)";

    const prompt = `You are helping an executor file a new estate-administration task. Decide where it belongs.

ESTATE: ${estate?.deceased_name || "the deceased"}; State: ${estate?.state_of_residence || "unknown"}. This is assistance, not legal advice.

PHASES (choose exactly one for "phase", copied verbatim):
${phases.join("\n")}

EXISTING TASKS (id | [phase] text (status)) — a possible PARENT to nest the new task under:
${taskList}

NEW TASK: ${text.trim()}${detail ? `\nDETAIL: ${detail.trim()}` : ""}

Pick the single best phase. THEN decide whether this new task is clearly a sub-step of one of the existing tasks above — if so, set parent_id to that task's id (and the phase should match that parent's phase). Only nest when it genuinely belongs under that task; otherwise set parent_id to null and it becomes a top-level task in the chosen phase. When unsure about nesting, prefer null.

Return ONLY JSON: {"phase":"<one phase label, verbatim>","parent_id":"<existing task id or null>","reason":"one short sentence explaining the placement"}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const out = resp.content[0].type === "text" ? resp.content[0].text : "";
    const parsed = jsonFrom(out);

    // Validate everything the model returned against the real data.
    const phase = phases.includes(parsed.phase) ? parsed.phase : phases[0];
    const parent = tasks.find(t => t.id === parsed.parent_id);
    // If nesting, the phase must match the parent's phase.
    const finalPhase = parent ? (secLabel[parent.section_id] || phase) : phase;

    return {
      statusCode: 200,
      body: JSON.stringify({
        phase: finalPhase,
        parent_task_id: parent ? parent.id : null,
        parent_text: parent ? parent.text : null,
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
      }),
    };
  } catch (e) {
    console.error("place-task error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
