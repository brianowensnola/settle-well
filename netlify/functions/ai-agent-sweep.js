import { createClient } from "@supabase/supabase-js";

// Always-on AI agent (Phase 1) — scheduled processor.
// Runs every 30 minutes, finds estates whose data changed since the agent last
// ran (marked "dirty" by DB triggers), and fires the existing review engine for
// each. The review itself dedups against pending/dismissed suggestions, so
// repeated sweeps don't pile up. Suggestions stay human-in-the-loop.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = { schedule: "*/30 * * * *" };

const SITE = () => process.env.URL || process.env.DEPLOY_PRIME_URL || "";
const MAX_PER_SWEEP = 25; // safety cap per run

export const handler = async () => {
  const { data: rows, error } = await supabase
    .from("estate_ai_agent_state")
    .select("estate_id, last_run_at, last_seen_change_at")
    .eq("enabled", true);
  if (error) {
    console.error("agent sweep: load error", error.message);
    return { statusCode: 500, body: "load error" };
  }

  // Due = never run, or changed since the last run.
  const due = (rows || [])
    .filter(r => !r.last_run_at || new Date(r.last_seen_change_at) > new Date(r.last_run_at))
    .slice(0, MAX_PER_SWEEP);

  let triggered = 0;
  for (const row of due) {
    try {
      // Fire the existing review engine (a -background function: returns 202
      // and runs asynchronously). Fire-and-forget per estate.
      await fetch(`${SITE()}/.netlify/functions/ai-advisor-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estateId: row.estate_id, mode: "review" }),
      });
      // Stamp the watermark so we don't re-run until new changes arrive.
      await supabase
        .from("estate_ai_agent_state")
        .update({ last_run_at: new Date().toISOString() })
        .eq("estate_id", row.estate_id);
      triggered++;
    } catch (e) {
      console.error("agent sweep: estate", row.estate_id, e?.message);
    }
  }

  console.log(`agent sweep: ${triggered}/${due.length} estates triggered`);
  return { statusCode: 200, body: JSON.stringify({ triggered, due: due.length }) };
};
