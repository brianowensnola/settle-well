import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

// Generate a standard, estate-tailored list of questions/concerns an executor
// should bring to a meeting (especially an initial meeting) with a given
// contact. Executor-only. Returns { questions: [...] }.
export const handler = async (event) => {
  let estateId, contactName, contactRole, meetingType, notes;
  try {
    ({ estateId, contactName, contactRole, meetingType, notes } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId) return { statusCode: 400, body: JSON.stringify({ error: "estateId required" }) };

  // Caller must be the executor of this estate.
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: caller, error: cErr } = await admin.auth.getUser(token);
  if (cErr || !caller?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", caller.user.id);
  const ok = (roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor"));
  if (!ok) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const { data: estate } = await admin.from("estates").select("deceased_name, state_of_residence, intake_answers").eq("id", estateId).single();
    const prompt = `You are an expert estate-administration advisor preparing a first-time executor for a ${meetingType === "initial" ? "FIRST/initial" : ""} meeting.

MEETING WITH: ${contactName || "a contact"}${contactRole ? ` (role: ${contactRole})` : ""}.
ESTATE: ${estate?.deceased_name || "the decedent"}; state of residence: ${estate?.state_of_residence || "unknown"}.
${notes ? `EXECUTOR'S NOTES ABOUT THIS MEETING: ${notes}` : ""}
INTAKE CONTEXT: ${JSON.stringify(estate?.intake_answers || {}).slice(0, 1500)}

Produce the practical questions and concerns the executor should raise in this meeting — the things a first-timer wouldn't know to ask, tailored to this contact's role and this estate's state. Be specific and actionable. This is general guidance, not legal advice.

Return ONLY JSON: {"questions":["...", "..."]} with 6-12 concise questions.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content?.find(b => b.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : { questions: [] };
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 12) : [];
    return { statusCode: 200, body: JSON.stringify({ questions }) };
  } catch (e) {
    console.error("meeting-prep error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "prep failed" }) };
  }
};
