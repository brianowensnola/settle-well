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

// "What am I missing?" — review the whole estate and propose missing tasks/gaps
async function runReview(estate) {
  const estateId = estate.id;
  const [tasksRes, notesRes, docsRes, finRes, secRes] = await Promise.all([
    supabase.from("estate_tasks").select("text, status, section_id, tag").eq("estate_id", estateId),
    supabase.from("estate_daily_notes").select("content, note_date").eq("estate_id", estateId).order("note_date", { ascending: false }).limit(30),
    supabase.from("estate_documents").select("name, have, requested").eq("estate_id", estateId),
    supabase.from("estate_financials").select("name, category, status").eq("estate_id", estateId),
    supabase.from("estate_sections").select("id, label").eq("estate_id", estateId),
  ]);
  const secLabel = Object.fromEntries((secRes.data ?? []).map(s => [s.id, s.label]));
  const tasks = (tasksRes.data ?? []).map(t => `[${secLabel[t.section_id] ?? "?"}] ${t.text} (${t.status})`);
  const notes = (notesRes.data ?? []).map(n => `${n.note_date}: ${n.content}`);
  const docs = (docsRes.data ?? []).map(d => `${d.name} (${d.have ? "have" : d.requested ? "requested" : "needed"})`);
  const assets = (finRes.data ?? []).filter(f => f.category === "asset").map(f => f.name);

  const prompt = `You are an expert estate-administration advisor helping an executor who has never closed an estate before. Your job: review the CURRENT STATE of this estate and identify TASKS the executor likely needs but does NOT already have, and gaps worth flagging. Be forward-thinking and specific — surface things a first-timer wouldn't know to worry about.

ESTATE: ${estate.deceased_name}; State of residence: ${estate.state_of_residence || "unknown"}.
Scope any legal/procedural guidance to that state. This is assistance, not legal advice.

INTAKE ANSWERS: ${JSON.stringify(estate.intake_answers || {})}

EXISTING TASKS (do NOT duplicate these):
${tasks.join("\n") || "(none)"}

DOCUMENTS:
${docs.join("\n") || "(none)"}

ASSETS:
${assets.join("\n") || "(none)"}

RECENT NOTES (an action mentioned in a note but with no matching task is a gap worth surfacing):
${notes.join("\n") || "(none)"}

Return ONLY JSON:
{"suggestions":[{"title":"short actionable task","detail":"one sentence on why this matters or what gap it fills","phase":"one of: ${PHASES.join(" | ")}"}]}
Propose 5-15 of the most valuable, non-duplicative suggestions. If something in the notes implies an action with no task, include it.`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const text = resp.content[0].type === "text" ? resp.content[0].text : "";
  const parsed = jsonFrom(text);
  return (parsed.suggestions || []).map(s => ({
    estate_id: estateId, kind: "review", title: s.title, detail: s.detail || null,
    suggested_phase: PHASES.includes(s.phase) ? s.phase : null, is_private: false, status: "pending",
  }));
}

// Forensic audit — analyze financial statements for findings → private task suggestions
async function runForensic(estate, filePaths) {
  const estateId = estate.id;
  const content = [];
  for (const filePath of filePaths) {
    const { data, error } = await supabase.storage.from("estate-documents").download(filePath);
    if (error) continue;
    const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    const ext = filePath.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png"].includes(ext)) {
      content.push({ type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: base64 } });
    } else {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
    }
  }
  if (content.length === 0) return [];

  const prompt = `You are a forensic financial analyst reviewing a deceased person's financial statements for an estate. Identify items the executor should investigate: recurring payments/subscriptions, unknown or unexpected payees, transfers to individuals, large or unusual withdrawals, and any sign of accounts, debts, income, or obligations that may not be otherwise known. Be specific (names, amounts, dates when visible). This is investigative assistance, not an accusation or legal conclusion.

Return ONLY JSON:
{"findings":[{"title":"short actionable task, e.g. 'Investigate recurring $287 payment to ...'","detail":"what you saw and why it warrants a look"}]}`;

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: [...content, { type: "text", text: prompt }] }],
  });
  const text = resp.content[0].type === "text" ? resp.content[0].text : "";
  const parsed = jsonFrom(text);
  return (parsed.findings || []).map(f => ({
    estate_id: estateId, kind: "forensic", title: f.title, detail: f.detail || null,
    suggested_phase: "Phase 11 — Commonly Missed Items", is_private: true, status: "pending",
  }));
}

export const handler = async (event) => {
  let estateId, mode, filePaths;
  try {
    ({ estateId, mode = "review", filePaths = [] } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId) return { statusCode: 400, body: JSON.stringify({ error: "estateId required" }) };

  try {
    const { data: estate, error } = await supabase.from("estates").select("*").eq("id", estateId).single();
    if (error || !estate) throw new Error("estate not found");

    const rows = mode === "forensic" ? await runForensic(estate, filePaths) : await runReview(estate);
    if (rows.length > 0) {
      await supabase.from("estate_ai_suggestions").insert(rows);
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, count: rows.length }) };
  } catch (e) {
    console.error("AI advisor error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "advisor failed" }) };
  }
};
