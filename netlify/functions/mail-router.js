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

    const prompt = `This is a scanned piece of mail (the first page is usually the ENVELOPE, then the contents) for a family administering multiple related estates. Read all pages and report on it.

CANDIDATE ESTATES (use the addressee, the deceased's name, account holders, or context to choose):
${candidates}

Determine:
- which estate it most likely belongs to (or null if truly undeterminable — lower confidence if unsure)
- the SENDER (from the envelope/letterhead)
- a short display name and a one-sentence summary
- whether it is a BILL or anything requiring PAYMENT; if so, the amount and due date
- whether it is TIME-SENSITIVE (a deadline, court date, response-by date, or payment due soon)
- the single most important ACTION the executor should take, if any

Return ONLY JSON:
{"estate_id":"<one of the ids above, or null>","sender":"who it's from","name":"short display name (e.g. 'PNC mortgage statement - May 2026')","doc_type":"one of: legal | financial | property | insurance | tax | mail | other","summary":"one sentence","is_bill":true|false,"amount":<number or null>,"due_date":"YYYY-MM-DD or null","urgent":true|false,"action":"one-line suggested action or null","confidence":0.0}`;

    const resp = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 700,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    });
    const text = resp.content[0].type === "text" ? resp.content[0].text : "";
    const m = jsonFrom(text);

    const validId = (estates ?? []).some(e => e.id === m.estate_id) ? m.estate_id : null;
    const validDate = d => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    await supabase.from("family_mail").update({
      suggested_estate_id: validId,
      sender: m.sender || null,
      ai_name: m.name || mail.original_name,
      ai_doc_type: ["legal", "financial", "property", "insurance", "tax", "mail", "other"].includes(m.doc_type) ? m.doc_type : "mail",
      ai_summary: m.summary || null,
      ai_confidence: typeof m.confidence === "number" ? m.confidence : null,
      is_bill: !!m.is_bill,
      bill_amount: (m.amount === 0 || m.amount) ? Number(m.amount) : null,
      bill_due: validDate(m.due_date),
      urgent: !!m.urgent,
      ai_action: m.action || null,
    }).eq("id", mailId);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (e) {
    console.error("mail-router error:", e);
    // Non-fatal: the item still sits in the inbox for manual routing.
    return { statusCode: 200, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
