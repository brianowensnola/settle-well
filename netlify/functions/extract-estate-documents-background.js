import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new Anthropic();

const EXTRACTION_PROMPT = `You are an AI assistant helping process estate documents to extract information for an estate intake form.

Extract structured data from the provided document and map it to the following intake fields. For each field:
- Provide the extracted value
- Rate confidence (0.0-1.0) based on document clarity and how explicitly the information is stated
- Explain the extraction source/reasoning

Extract ONLY information explicitly stated in the document. If a field cannot be extracted, omit it rather than guessing.

ESTATE INTAKE FIELDS:

DECEASED INFO:
- Full legal name (key: deceased_name)
- Date of death (key: deceased_dod, format: YYYY-MM-DD)
- State of residence (key: state_of_residence)
- Marital status (key: marital_status, values: married|widowed|divorced|single)
- Was employed at death? (key: was_employed, values: yes|no)

FAMILY INFO:
- Had spouse? (key: has_spouse, values: yes|no)
- Had children? (key: has_children, values: yes|no)
- Minor children? (key: has_minor_children, values: yes|no)
- Adult children from prior relationships? (key: has_adult_children_prior, values: yes|no)
- Minor dependents requiring guardianship? (key: has_minor_dependents, values: yes|no)

LEGAL DOCUMENTS:
- Had a will? (key: has_will, values: yes|no)
- Had a trust? (key: has_trust, values: yes|no)
- Pending lawsuits or legal claims? (key: has_pending_litigation, values: yes|no)

ASSETS:
- Owned real estate? (key: has_real_estate, values: yes|no)
- Owned vehicles? (key: has_vehicles, values: yes|no)
- Owned a business or had business interests? (key: has_business, values: yes|no)
- Had retirement accounts? (key: has_retirement, values: yes|no)
- Had life insurance policies? (key: has_life_insurance, values: yes|no)
- Digital assets or cryptocurrency? (key: has_digital_assets, values: yes|no)
- Had a safe deposit box? (key: has_safe_deposit_box, values: yes|no)

BENEFITS & EMPLOYMENT:
- Receiving Social Security benefits? (key: receives_social_security, values: yes|no)
- On Medicare or Medicaid? (key: on_medicare_medicaid, values: yes|no)

DEBTS:
- Known debts? (key: has_debts, values: yes|no)

MILITARY:
- Were they a veteran or active military? (key: is_veteran, values: yes|no)

Return ONLY valid JSON with structure:
{
  "extracted_fields": {
    "field_key": {
      "value": "extracted value",
      "confidence": 0.95,
      "source": "Found in [document name], [location]"
    }
  },
  "extraction_summary": "Brief summary of what was found in the document",
  "total_fields_extracted": 5,
  "overall_confidence": 0.87
}`;

// Extract intake answers from a single file
async function extractFile(filePath) {
  // Download from Supabase storage
  const { data, error } = await supabase.storage
    .from("estate-documents")
    .download(filePath);

  if (error) throw error;

  const buffer = await data.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const fileName = filePath.split("/").pop();
  const fileExt = fileName.split(".").pop().toLowerCase();

  // Images need "image" blocks; PDFs need "document" blocks
  let contentBlock;
  if (["jpg", "jpeg", "png"].includes(fileExt)) {
    contentBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: fileExt === "png" ? "image/png" : "image/jpeg",
        data: base64,
      },
    };
  } else {
    contentBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
      title: fileName,
    };
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [contentBlock, { type: "text", text: EXTRACTION_PROMPT }],
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
}

export const handler = async (event) => {
  let estateId, filePaths;
  try {
    ({ estateId, filePaths } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "invalid request body" }) };
  }

  if (!estateId || !filePaths || filePaths.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "estateId and filePaths required" }),
    };
  }

  // Process each file in its own Claude call. One combined request blows
  // past the API's 32MB request cap on large batches, and per-file calls
  // mean a single bad file can't fail the whole batch.
  for (const filePath of filePaths) {
    try {
      await supabase
        .from("estate_document_extractions")
        .update({ extraction_status: "processing" })
        .eq("file_path", filePath);

      const extractionResult = await extractFile(filePath);

      await supabase
        .from("estate_document_extractions")
        .update({
          extraction_status: "completed",
          extracted_answers: extractionResult.extracted_fields || {},
          confidence_scores: Object.fromEntries(
            Object.entries(extractionResult.extracted_fields || {}).map(
              ([key, data]) => [key, data.confidence]
            )
          ),
          updated_at: new Date().toISOString(),
        })
        .eq("file_path", filePath);
    } catch (error) {
      console.error(`Extraction failed for ${filePath}:`, error);
      await supabase
        .from("estate_document_extractions")
        .update({
          extraction_status: "failed",
          extraction_error: error.message || "Extraction failed",
          updated_at: new Date().toISOString(),
        })
        .eq("file_path", filePath);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, filesProcessed: filePaths.length }),
  };
};
