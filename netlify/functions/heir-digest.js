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
const money = n => n == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

// Executor-only: generate a heir-facing progress update from NON-PRIVATE activity
// only (task titles, status, financial totals) — never raw/private notes — and
// save it to the estate so heirs can read it.
export const handler = async (event) => {
  let estateId;
  try { ({ estateId } = JSON.parse(event.body)); } catch { return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) }; }
  if (!estateId) return { statusCode: 400, body: JSON.stringify({ error: "estateId required" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: callerData, error: cErr } = await admin.auth.getUser(token);
  if (cErr || !callerData?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", callerData.user.id);
  const ok = (roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor"));
  if (!ok) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const [estateRes, tasksRes, finRes, txnRes] = await Promise.all([
      admin.from("estates").select("deceased_name, state_of_residence, status_stage").eq("id", estateId).single(),
      admin.from("estate_tasks").select("text, status, updated_at, is_private").eq("estate_id", estateId).eq("is_private", false),
      admin.from("estate_financials").select("category, amount, status, is_private").eq("estate_id", estateId).eq("is_private", false),
      admin.from("estate_transactions").select("amount").eq("estate_id", estateId),
    ]);
    const estate = estateRes.data || {};
    const tasks = tasksRes.data ?? [];
    const fin = finRes.data ?? [];
    const txns = txnRes.data ?? [];

    const done = tasks.filter(t => t.status === "done");
    const open = tasks.filter(t => t.status !== "done");
    const recentDone = [...done].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")).slice(0, 10).map(t => t.text);
    const accountsBal = fin.filter(f => f.category === "account").reduce((s, a) => s + (a.amount ?? 0), 0);
    const received = txns.filter(t => (t.amount ?? 0) > 0).reduce((s, t) => s + t.amount, 0);
    const spent = txns.filter(t => (t.amount ?? 0) < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const assets = fin.filter(f => f.category === "asset");
    const assetsDisposed = assets.filter(a => ["sold", "distributed"].includes(a.status)).length;

    const prompt = `Write a warm, clear progress update for the family/heirs of an estate being settled. The reader is a grieving family member, not a lawyer — be plain-spoken, reassuring but honest, and concrete about what has happened and what's next. 2-4 short paragraphs. No legal or tax advice. Do not invent details beyond the facts below.

ESTATE: ${estate.deceased_name || "the estate"} (${estate.state_of_residence || ""})
CURRENT STAGE: ${estate.status_stage || "in progress"}
PROGRESS: ${done.length} of ${done.length + open.length} tasks complete; ${open.length} still open.
RECENTLY COMPLETED: ${recentDone.join("; ") || "(none yet)"}
FINANCES (for transparency): cash on hand ${money(accountsBal) || "—"}; money received so far ${money(received) || "$0"}; money paid out so far ${money(spent) || "$0"}.
ASSETS: ${assets.length} tracked, ${assetsDisposed} sold or distributed.

Write it addressed to the family (e.g. "Here's where things stand with [name]'s estate..."). End with a brief, honest note on what's coming next. Plain text only.`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const digest = (resp.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (!digest) throw new Error("empty digest");

    const at = new Date().toISOString();
    await admin.from("estates").update({ heir_digest: digest, heir_digest_at: at }).eq("id", estateId);
    return { statusCode: 200, body: JSON.stringify({ digest, at }) };
  } catch (e) {
    console.error("heir-digest error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
