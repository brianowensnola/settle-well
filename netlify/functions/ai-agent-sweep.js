import { createClient } from "@supabase/supabase-js";

// Always-on AI agent (Phase 1) — scheduled processor (Netlify v2 scheduled
// function: default export + config.schedule). Runs once a day, finds
// estates whose data changed since the agent last ran (marked "dirty" by DB
// triggers), and fires the existing review engine for each. The review dedups
// against pending/dismissed suggestions, so repeated sweeps don't pile up.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE = () => process.env.URL || process.env.DEPLOY_PRIME_URL || "";
const MAX_PER_SWEEP = 25;

export default async () => {
  const { data: rows, error } = await supabase
    .from("estate_ai_agent_state")
    .select("estate_id, last_run_at, last_seen_change_at")
    .eq("enabled", true);
  if (error) {
    console.error("agent sweep: load error", error.message);
    return new Response("load error", { status: 500 });
  }

  // Due = never run, or changed since the last run.
  const due = (rows || [])
    .filter(r => !r.last_run_at || new Date(r.last_seen_change_at) > new Date(r.last_run_at))
    .slice(0, MAX_PER_SWEEP);

  let triggered = 0;
  for (const row of due) {
    try {
      await fetch(`${SITE()}/.netlify/functions/ai-advisor-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estateId: row.estate_id, mode: "review" }),
      });
    } catch (e) {
      console.error("agent sweep: fire failed for", row.estate_id, e?.message);
    }
    // Stamp the watermark regardless, so a transient fire failure doesn't wedge
    // the estate as permanently "due"; the next change re-marks it dirty.
    await supabase.from("estate_ai_agent_state")
      .update({ last_run_at: new Date().toISOString() })
      .eq("estate_id", row.estate_id);
    triggered++;
  }

  console.log(`agent sweep: ${triggered}/${due.length} estates processed`);
  return new Response(JSON.stringify({ triggered, due: due.length }), {
    headers: { "content-type": "application/json" },
  });
};

// Once a day at 08:00 UTC (~3am Central). Was every 30 min — backed off to cut
// AI cost; the on-demand "Review the estate" button still runs anytime.
export const config = { schedule: "0 8 * * *" };
