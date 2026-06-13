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

const FORENSIC_PROMPT = `You are a forensic financial analyst reviewing ONE of a deceased person's financial statements for an estate. Surface only the findings an executor genuinely needs to investigate — quality over quantity.

Report:
- Unknown, unexpected, or unusual payees and transfers (especially to individuals).
- Large or atypical deposits and withdrawals.
- Signs of OTHER accounts, loans, debts, income, or obligations not otherwise known (loan payments, transfers to other accounts, etc.).
- Recurring payments/subscriptions — report each recurring item ONCE, consolidated (e.g. "Recurring $287.78/mo to Goodleap"), never per occurrence.

Do NOT flag ordinary, expected, low-value purchases individually. Consolidate aggressively. Return the ~10 most significant findings; never more than 15.

Be specific (names, amounts, dates). This is investigative assistance, not an accusation or legal conclusion.

Return ONLY valid, COMPLETE JSON (do not truncate):
{"findings":[{"title":"short actionable task","detail":"what you saw and why it warrants a look"}]}`;

// Forensic audit — analyze each financial statement separately (one Claude call
// per file). A combined multi-PDF request hits page/processing limits, so we
// loop. Failures are surfaced as visible suggestions rather than silently lost.
async function runForensic(estate, filePaths) {
  const estateId = estate.id;
  const rows = [];
  for (const filePath of filePaths) {
    try {
      const { data, error } = await supabase.storage.from("estate-documents").download(filePath);
      if (error) throw error;
      const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      const ext = filePath.split(".").pop().toLowerCase();
      const block = ["jpg", "jpeg", "png"].includes(ext)
        ? { type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: base64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

      const resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 4096,
        messages: [{ role: "user", content: [block, { type: "text", text: FORENSIC_PROMPT }] }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const parsed = jsonFrom(text);
      for (const f of (parsed.findings || [])) {
        rows.push({
          estate_id: estateId, kind: "forensic", title: f.title, detail: f.detail || null,
          suggested_phase: "Phase 11 — Commonly Missed Items", is_private: true, status: "pending",
        });
      }
    } catch (e) {
      console.error("forensic file error", filePath, e?.message);
      rows.push({
        estate_id: estateId, kind: "forensic",
        title: "Couldn't analyze one statement — see detail",
        detail: `Error analyzing a statement: ${(e?.message || "unknown").slice(0, 400)}`,
        suggested_phase: "Phase 11 — Commonly Missed Items", is_private: true, status: "pending",
      });
    }
  }
  return rows;
}

// Read each uploaded document (vision) to identify what it is, then match it
// to the task it satisfies. File names are often meaningless (IMG_1234.jpeg),
// so we look at the actual content, not the name.
async function runDocuments(estate) {
  const estateId = estate.id;
  const [docsRes, tasksRes, secRes] = await Promise.all([
    supabase.from("estate_documents").select("id, name, doc_type, file_path, have, linked_task_id").eq("estate_id", estateId).eq("have", true),
    supabase.from("estate_tasks").select("id, text, status, section_id").eq("estate_id", estateId),
    supabase.from("estate_sections").select("id, label").eq("estate_id", estateId),
  ]);
  const docs = (docsRes.data ?? []).filter(d => !d.linked_task_id && d.file_path);
  const tasks = tasksRes.data ?? [];
  if (docs.length === 0 || tasks.length === 0) return [];
  const secLabel = Object.fromEntries((secRes.data ?? []).map(s => [s.id, s.label]));
  const taskList = tasks.map(t => `${t.id} — ${t.text} (${t.status})`).join("\n");

  const rows = [];
  for (const doc of docs.slice(0, 30)) {
    try {
      const { data, error } = await supabase.storage.from("estate-documents").download(doc.file_path);
      if (error) continue;
      const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      const ext = doc.file_path.split(".").pop().toLowerCase();
      const block = ["jpg", "jpeg", "png"].includes(ext)
        ? { type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: base64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

      const prompt = `Look at this estate document and identify what it is (e.g. death certificate, obituary, last will & testament, vehicle title, deed, bank/financial statement, insurance policy, government ID, tax form, power of attorney). Then decide which TASK below, if any, it satisfies or directly relates to.

TASKS (id — text (status)):
${taskList}

Recommend an action: "mark_done" if the document shows the task is complete (e.g. a death certificate completing an order-death-certificates task, an obituary completing an obituary task, a recorded deed completing a transfer); "mark_in_progress" if it's underway; "link_only" to attach without changing status. If no task clearly relates, set task_id to null.

Return ONLY JSON: {"doc_type":"short label of what this is","task_id":"<task id or null>","action":"mark_done|mark_in_progress|link_only","reason":"one sentence"}`;

      const resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 600,
        messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const m = jsonFrom(text);
      const task = tasks.find(t => t.id === m.task_id);
      if (!task) continue;
      const label = m.action === "mark_done" ? "mark done" : m.action === "mark_in_progress" ? "mark in progress" : "link";
      const what = m.doc_type ? `${m.doc_type} (${doc.name})` : doc.name;
      rows.push({
        estate_id: estateId, kind: "documents",
        title: `Link ${what} → "${task.text}" (${label})`,
        detail: m.reason || null, suggested_phase: secLabel[task.section_id] || null,
        is_private: false, status: "pending",
        link_document_id: doc.id, link_task_id: task.id, action: m.action || "link_only",
      });
    } catch (e) {
      console.error("doc match error", doc.id, e?.message);
    }
  }
  return rows;
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

    const rows = mode === "forensic" ? await runForensic(estate, filePaths)
      : mode === "documents" ? await runDocuments(estate)
      : await runReview(estate);
    if (rows.length > 0) {
      await supabase.from("estate_ai_suggestions").insert(rows);
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, count: rows.length }) };
  } catch (e) {
    console.error("AI advisor error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "advisor failed" }) };
  }
};
