import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
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

// Read an uploaded asset document (title, registration, deed, statement, etc.)
// and extract structured asset fields to pre-fill the asset record. Executor-only.
export const handler = async (event) => {
  let estateId, filePath, assetType;
  try {
    ({ estateId, filePath, assetType } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!estateId || !filePath) return { statusCode: 400, body: JSON.stringify({ error: "estateId and filePath required" }) };

  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: "not authenticated" }) };
  const { data: caller, error: cErr } = await admin.auth.getUser(token);
  if (cErr || !caller?.user) return { statusCode: 401, body: JSON.stringify({ error: "invalid session" }) };
  const { data: roles } = await admin.from("estate_users").select("role, estate_id").eq("auth_user_id", caller.user.id);
  const ok = (roles || []).some(r => r.estate_id === estateId && (r.role === "administrator" || r.role === "executor"));
  if (!ok) return { statusCode: 403, body: JSON.stringify({ error: "executor access required" }) };

  try {
    const { data: file, error: dlErr } = await admin.storage.from("estate-documents").download(filePath);
    if (dlErr) throw dlErr;
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ext = filePath.split(".").pop().toLowerCase();
    const block = ["jpg", "jpeg", "png"].includes(ext)
      ? { type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const prompt = `Look at this estate asset document (it may be a vehicle/vessel title, registration, deed, appraisal, or account statement) for a ${assetType || "asset"}. Extract what's present. Be accurate; leave a field null if not shown — do not guess.

Return ONLY JSON:
{
  "name": "best short asset name (e.g. '2018 Yamaha WaveRunner', '2005 GMC Sierra 1500') or null",
  "vin_serial": "VIN / HIN / serial number or null",
  "year": "model year or null",
  "make": "make/brand or null",
  "model": "model or null",
  "amount": <number value/appraised amount if shown, else null>,
  "doc_kind": "what this document is (e.g. 'Texas vehicle title')"
}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    });
    const text = resp.content?.find(b => b.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    return { statusCode: 200, body: JSON.stringify(parsed) };
  } catch (e) {
    console.error("extract-asset error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: friendlyAiError(e) }) };
  }
};
