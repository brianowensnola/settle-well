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

// Reasoning-heavy passes (estate review, forensic consolidation) use the most
// capable model for depth; high-volume vision/extraction stays on Sonnet for
// speed/cost.
const ADVISOR_MODEL = "claude-opus-4-8";
const EXTRACT_MODEL = "claude-sonnet-4-6";

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
  const [tasksRes, notesRes, docsRes, finRes, secRes, sugRes] = await Promise.all([
    supabase.from("estate_tasks").select("text, status, section_id, tag").eq("estate_id", estateId),
    supabase.from("estate_daily_notes").select("content, note_date").eq("estate_id", estateId).order("note_date", { ascending: false }).limit(30),
    supabase.from("estate_documents").select("name, have, requested").eq("estate_id", estateId),
    supabase.from("estate_financials").select("name, category, status").eq("estate_id", estateId),
    supabase.from("estate_sections").select("id, label").eq("estate_id", estateId),
    // Already-suggested items (still pending, or previously dismissed) so we
    // don't re-propose them on repeat/auto runs.
    supabase.from("estate_ai_suggestions").select("title, status").eq("estate_id", estateId).eq("kind", "review").in("status", ["pending", "dismissed"]),
  ]);
  const secLabel = Object.fromEntries((secRes.data ?? []).map(s => [s.id, s.label]));
  const tasks = (tasksRes.data ?? []).map(t => `[${secLabel[t.section_id] ?? "?"}] ${t.text} (${t.status})`);
  const notes = (notesRes.data ?? []).map(n => `${n.note_date}: ${n.content}`);
  const docs = (docsRes.data ?? []).map(d => `${d.name} (${d.have ? "have" : d.requested ? "requested" : "needed"})`);
  const assets = (finRes.data ?? []).filter(f => f.category === "asset").map(f => f.name);
  const priorSuggestions = (sugRes.data ?? []).map(s => s.title);

  const prompt = `You are an expert estate-administration advisor helping an executor who has never closed an estate before. Your job: review the CURRENT STATE of this estate and identify TASKS the executor likely needs but does NOT already have, and gaps worth flagging. Be forward-thinking and specific — surface things a first-timer wouldn't know to worry about.

ESTATE: ${estate.deceased_name}; State of residence: ${estate.state_of_residence || "unknown"}.
Scope any legal/procedural guidance to that state. This is assistance, not legal advice.

INTAKE ANSWERS: ${JSON.stringify(estate.intake_answers || {})}

EXISTING TASKS (do NOT duplicate these):
${tasks.join("\n") || "(none)"}

ALREADY SUGGESTED — pending review or previously dismissed by the executor (do NOT propose these again, even reworded):
${priorSuggestions.join("\n") || "(none)"}

DOCUMENTS:
${docs.join("\n") || "(none)"}

ASSETS:
${assets.join("\n") || "(none)"}

RECENT NOTES (an action mentioned in a note but with no matching task is a gap worth surfacing):
${notes.join("\n") || "(none)"}

QUALITY BAR — make every suggestion earn its place:
- Be SPECIFIC to THIS estate. Reference the actual asset, account, note, document, or this state's probate process that triggers it (e.g. "File the Goodleap solar lien release once the loan is paid" — not "handle liens").
- NO generic boilerplate that would apply to any estate (e.g. "stay organized", "keep records", "consult an attorney"), and nothing already implied by an existing task.
- Favor the non-obvious, anticipatory things a first-time executor would miss (e.g. a vacant house's lawn/insurance, a recurring charge that keeps draining the estate, a deadline tied to date of death).
- The detail must say WHY it matters or what specifically prompted it — not restate the title.
- Quality over quantity: 3-10 high-value, distinct suggestions. Fewer great ones beats a long generic list.

Return ONLY JSON:
{"suggestions":[{"title":"short actionable task","detail":"one sentence: the specific trigger and why it matters","phase":"one of: ${PHASES.join(" | ")}"}]}`;

  const resp = await client.messages.create({
    model: ADVISOR_MODEL,
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

const FORENSIC_PROMPT = `You are a forensic financial analyst reviewing ONE of a deceased person's financial statements for an estate. The executor needs TWO things: (1) anything suspicious or unknown to investigate, and (2) EVERY recurring bill, subscription, utility, loan, and insurance payment — because each one keeps draining the estate until it is cancelled or transferred, no matter how small.

Report:
- EVERY recurring / automatic payment, INCLUDING small ones: subscriptions (streaming, apps, memberships, dating sites), utilities (electric, water/sewer, gas, internet/cable, cell phone), insurance, loan/mortgage payments, and any other repeating charge. Report each recurring item ONCE, consolidated with its payee and monthly amount (e.g. "Recurring $287.78/mo to Goodleap", "Netflix $15.49/mo", "City of Corpus Christi water ~$170/mo"). A $9.99/mo subscription still must be surfaced so it can be cancelled.
- Signs of OTHER accounts, loans, debts, income, or obligations not otherwise known (loan payments, transfers to other accounts, etc.).
- Unknown, unexpected, or unusual payees and transfers (especially to individuals).
- Large or atypical deposits and withdrawals.

Do NOT list ordinary ONE-OFF purchases (a single grocery run, a one-time restaurant charge). But DO include anything that RECURS, even if it's small and ordinary.

Be specific (names, amounts, dates). This is investigative assistance, not an accusation or legal conclusion.

Return ONLY valid, COMPLETE JSON (do not truncate):
{"findings":[{"title":"short actionable task","detail":"what you saw and why it warrants a look"}]}`;

const FORENSIC_ROW = (estateId, title, detail) => ({
  estate_id: estateId, kind: "forensic", title, detail: detail || null,
  suggested_phase: "Phase 11 — Commonly Missed Items", is_private: true, status: "pending",
});

// Finances categories an accepted 'financial' suggestion can land in.
const FIN_CATEGORIES = ["account", "obligation", "liability", "asset", "insurance_resolved", "insurance_pending"];
const FINANCIAL_ROW = (estateId, e, isPrivate) => ({
  estate_id: estateId, kind: "financial",
  title: (e.name || "Unnamed entry").slice(0, 200),
  detail: e.detail || null,
  is_private: !!isPrivate, status: "pending",
  fin_category: FIN_CATEGORIES.includes(e.category) ? e.category : "account",
  fin_amount: (e.amount === 0 || e.amount) ? Number(e.amount) : null,
  fin_lender: e.lender || null,
  fin_status: e.status || null,
});

// Forensic audit — analyze each statement separately (one Claude call per file,
// since a combined multi-PDF request hits page/processing limits), then run a
// consolidation pass that merges duplicates and recurring items across all the
// monthly statements into one deduplicated, prioritized set.
async function runForensic(estate, filePaths) {
  const estateId = estate.id;
  const raw = [];        // { title, detail } collected across all statements
  const errorRows = [];
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
        model: EXTRACT_MODEL, max_tokens: 4096,
        messages: [{ role: "user", content: [block, { type: "text", text: FORENSIC_PROMPT }] }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const parsed = jsonFrom(text);
      for (const f of (parsed.findings || [])) raw.push({ title: f.title, detail: f.detail || "" });
    } catch (e) {
      console.error("forensic file error", filePath, e?.message);
      errorRows.push(FORENSIC_ROW(estateId, "Couldn't analyze one statement — see detail",
        `Error analyzing a statement: ${(e?.message || "unknown").slice(0, 400)}`));
    }
  }

  if (raw.length === 0) return errorRows;

  // Consolidation pass: merge duplicates / recurring items across statements,
  // and split the results into concrete FINANCIAL RECORDS (accounts, loans,
  // recurring obligations, insurance — accepted straight into Finances) vs
  // INVESTIGATIVE FINDINGS (things that need a look — accepted as tasks).
  let entries = [];
  let finalFindings = raw;
  try {
    const consPrompt = `These are raw forensic findings pulled from MULTIPLE monthly statements of the same estate, so many are duplicates or the same recurring item repeated across months. First merge duplicates and recurring items into ONE item each (e.g. combine every "Goodleap $287.78" hit into a single recurring item). Drop ONLY true one-off ordinary purchases — KEEP every recurring bill, subscription, utility, loan, and insurance payment even if it's small (each must be surfaced so the executor can cancel or transfer it). Keep specifics (names, amounts, dates/ranges).

Then split everything into two buckets:

1. "entries" — concrete FINANCIAL RECORDS the executor should add to the estate's finances ledger: bank/brokerage accounts, loans/debts, recurring monthly obligations (subscriptions, utilities, loan payments), and insurance policies. For each, give:
   - category: one of account | obligation | liability | asset | insurance_resolved | insurance_pending
     (account = a deposit/checking/savings/brokerage account; obligation = a recurring monthly payment; liability = a loan/debt/balance owed; asset = a titled/ownable thing of value; insurance_pending = a policy not yet claimed/paid; insurance_resolved = already paid out/closed)
   - name: short label (e.g. "Goodleap solar loan", "PNC checking ...1234", "Truist mortgage")
   - amount: a single number (monthly amount for obligations, balance for accounts, amount owed for liabilities) or null if unknown
   - lender: the lender/payee/institution if applicable, else null
   - status: a short status if evident (e.g. active, unknown) or null
   - detail: one sentence of supporting context (what you saw)

2. "findings" — things that warrant INVESTIGATION rather than a ledger entry: unknown/unexpected transfers (especially to individuals), large atypical deposits/withdrawals, or signs of accounts you cannot pin down. Each: {title, detail}.

A single item belongs in exactly ONE bucket. Order each bucket by importance. Aim for at most 25 items total.

RAW FINDINGS:
${raw.map((f, i) => `${i + 1}. ${f.title} — ${f.detail}`).join("\n")}

Return ONLY valid, COMPLETE JSON: {"entries":[{"category":"","name":"","amount":null,"lender":null,"status":null,"detail":""}],"findings":[{"title":"","detail":""}]}`;
    const resp = await client.messages.create({
      model: ADVISOR_MODEL, max_tokens: 4096,
      messages: [{ role: "user", content: consPrompt }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const parsed = jsonFrom(text);
    if (Array.isArray(parsed.entries)) entries = parsed.entries;
    if (Array.isArray(parsed.findings)) finalFindings = parsed.findings;
  } catch (e) {
    console.error("forensic consolidation error", e?.message);
    // fall back to the raw findings (as investigative tasks) if consolidation fails
  }

  return [
    ...entries.map(e => FINANCIAL_ROW(estateId, e, true)), // forensic-derived → private
    ...finalFindings.map(f => FORENSIC_ROW(estateId, f.title, f.detail)),
    ...errorRows,
  ];
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

      const prompt = `Look at this estate document and identify what it is (e.g. death certificate, obituary, last will & testament, vehicle title, deed, bank/financial statement, insurance policy, government ID, tax form, power of attorney). Then do two things:

1. Decide which TASK below, if any, it satisfies or directly relates to.
2. If this document is a BANK/FINANCIAL STATEMENT, LOAN/MORTGAGE document, or INSURANCE POLICY, extract the financial record it represents so it can be added to the estate's finances ledger.

TASKS (id — text (status)):
${taskList}

For the task: recommend "mark_done" if the document shows the task is complete (e.g. a death certificate completing an order-death-certificates task, an obituary completing an obituary task, a recorded deed completing a transfer); "mark_in_progress" if it's underway; "link_only" to attach without changing status. If no task clearly relates, set task_id to null.

For the financial record (only if applicable): category is one of account | obligation | liability | asset | insurance_resolved | insurance_pending (account = checking/savings/brokerage; obligation = recurring monthly payment; liability = loan/debt/balance owed; insurance_pending = policy not yet claimed). Give name (short label incl. institution and last 4 if shown), amount (balance for accounts, amount owed for loans, monthly for obligations; null if unknown), lender (institution/payee or null), and a one-sentence detail. If this document is NOT financial, set financial to null.

Return ONLY JSON: {"doc_type":"short label of what this is","task_id":"<task id or null>","action":"mark_done|mark_in_progress|link_only","reason":"one sentence","financial":{"category":"","name":"","amount":null,"lender":null,"detail":""}}`;

      const resp = await client.messages.create({
        model: EXTRACT_MODEL, max_tokens: 700,
        messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
      });
      const text = resp.content[0].type === "text" ? resp.content[0].text : "";
      const m = jsonFrom(text);

      // A financial document yields a financial-entry suggestion (not private —
      // it's a document the executor uploaded themselves).
      if (m.financial && m.financial.name && FIN_CATEGORIES.includes(m.financial.category)) {
        rows.push(FINANCIAL_ROW(estateId, { ...m.financial, status: m.financial.status || "active" }, false));
      }

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

// State-specific probate guidance. Uses web search to ground guidance in the
// estate's actual state, and is framed as general guidance, not legal advice.
async function runStateLaw(estate) {
  const estateId = estate.id;
  const state = estate.state_of_residence || "the state of residence";
  const [tasksRes, secRes, sugRes] = await Promise.all([
    supabase.from("estate_tasks").select("text, section_id").eq("estate_id", estateId),
    supabase.from("estate_sections").select("id, label").eq("estate_id", estateId),
    supabase.from("estate_ai_suggestions").select("title").eq("estate_id", estateId).eq("kind", "statelaw").in("status", ["pending", "dismissed"]),
  ]);
  const tasks = (tasksRes.data ?? []).map(t => t.text);
  const prior = (sugRes.data ?? []).map(s => s.title);

  const prompt = `You are an expert estate-administration advisor. This estate is administered in ${state}. Identify the STATE-SPECIFIC probate steps, deadlines, required court filings, and options the executor of a first-time, modest family estate should know — tailored to ${state}.

Use web search to verify CURRENT ${state} requirements (probate court process, inventory/appraisement deadline, creditor-notice rules, small-estate / affidavit / muniment-of-title style shortcuts, independent vs dependent administration, homestead/exempt property, tax filing deadlines). Prefer official .gov / court / state-bar sources.

INTAKE: ${JSON.stringify(estate.intake_answers || {}).slice(0, 1500)}
EXISTING TASKS (don't duplicate): ${tasks.join("; ") || "(none)"}
ALREADY SUGGESTED (don't repeat): ${prior.join("; ") || "(none)"}

This is GENERAL GUIDANCE, not legal advice. Every item must tell the executor to CONFIRM the specific requirement/deadline with the ${state} probate court or their attorney. Be concrete and ${state}-specific — no generic "consult an attorney" filler on its own.

Return ONLY JSON: {"suggestions":[{"title":"short actionable, ${state}-specific task","detail":"the specific ${state} rule/deadline + 'verify with the court/your attorney'","phase":"one of: ${PHASES.join(" | ")}"}]}
5-12 items.`;

  let text = "";
  try {
    const resp = await client.messages.create({
      model: ADVISOR_MODEL, max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    });
    text = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  } catch (toolErr) {
    console.warn("statelaw web search unavailable:", toolErr?.message);
    const resp = await client.messages.create({
      model: ADVISOR_MODEL, max_tokens: 4096,
      messages: [{ role: "user", content: prompt + "\n\n(No web access — rely on general knowledge of " + state + " probate; be clear each item must be verified.)" }],
    });
    text = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  }
  const parsed = jsonFrom(text);
  return (parsed.suggestions || []).map(s => ({
    estate_id: estateId, kind: "statelaw", title: s.title, detail: s.detail || null,
    suggested_phase: PHASES.includes(s.phase) ? s.phase : null, is_private: false, status: "pending",
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

    const rows = mode === "forensic" ? await runForensic(estate, filePaths)
      : mode === "documents" ? await runDocuments(estate)
      : mode === "statelaw" ? await runStateLaw(estate)
      : await runReview(estate);
    if (rows.length > 0) {
      await supabase.from("estate_ai_suggestions").insert(rows);
    }
    return { statusCode: 200, body: JSON.stringify({ success: true, count: rows.length }) };
  } catch (e) {
    console.error("AI advisor error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
