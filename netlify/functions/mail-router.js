import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const client = new Anthropic();

function jsonFrom(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

// Analyze ONE piece of family mail (vision) and suggest which estate it belongs
// to, what it is, and a short summary. One item per call keeps each request well
// under the 10s sync limit.
export const handler = async (event) => {
  let mailId;
  try {
    ({ mailId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid body" }) };
  }
  if (!mailId) return { statusCode: 400, body: JSON.stringify({ error: "mailId required" }) };

  try {
    const { data: mail, error } = await supabase.from("family_mail").select("*").eq("id", mailId).single();
    if (error || !mail) throw new Error("mail item not found");

    // Candidate estates the mail could belong to (the family unit).
    const { data: estates } = await supabase
      .from("estates").select("id, deceased_name, state_of_residence");
    const candidates = (estates ?? []).map(e => `- id ${e.id}: ${e.deceased_name}${e.state_of_residence ? " (" + e.state_of_residence + ")" : ""}`).join("\n");

    const { data: file, error: dlErr } = await supabase.storage.from("estate-documents").download(mail.file_path);
    if (dlErr) throw dlErr;
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ext = mail.file_path.split(".").pop().toLowerCase();
    const block = ["jpg", "jpeg", "png"].includes(ext)
      ? { type: "image", source: { type: "base64", media_type: ext === "png" ? "image/png" : "image/jpeg", data: base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

    const prompt = `This is a piece of mail/correspondence for a family that is administering multiple related estates. Read it and decide WHICH ESTATE it belongs to, what kind of document it is, and summarize it briefly.

CANDIDATE ESTATES (use the addressee, the deceased's name, account holders, or context to choose):
${candidates}

Pick the single best estate. If it genuinely could belong to either or you cannot tell, choose the most likely and lower your confidence.

Return ONLY JSON:
{"estate_id":"<one of the ids above, or null if truly undeterminable>","name":"short display name for this document (e.g. 'PNC mortgage statement - May 2026')","doc_type":"one of: legal | financial | property | insurance | tax | mail | other","summary":"one sentence on what this is and any action it implies","confidence":0.0}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 600,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const m = jsonFrom(text);

    const validId = (estates ?? []).some(e => e.id === m.estate_id) ? m.estate_id : null;
    await supabase.from("family_mail").update({
      suggested_estate_id: validId,
      ai_name: m.name || mail.original_name,
      ai_doc_type: ["legal", "financial", "property", "insurance", "tax", "mail", "other"].includes(m.doc_type) ? m.doc_type : "mail",
      ai_summary: m.summary || null,
      ai_confidence: typeof m.confidence === "number" ? m.confidence : null,
    }).eq("id", mailId);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    console.error("mail-router error:", e);
    // Non-fatal: the item still sits in the inbox for manual routing.
    return { statusCode: 200, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
