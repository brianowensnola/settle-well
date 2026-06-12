import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const client = new Anthropic();

const INTAKE_QUESTIONS = [
  { q: "Full legal name of deceased", key: "deceased_name", type: "text" },
  { q: "Date of death", key: "deceased_dod", type: "date" },
  { q: "State of residence at time of death", key: "state_of_residence", type: "text" },
  { q: "Marital status", key: "marital_status", type: "select" },
  { q: "Surviving spouse?", key: "has_spouse", type: "yes-no" },
  { q: "Had children?", key: "has_children", type: "yes-no" },
  { q: "Minor children?", key: "has_minor_children", type: "yes-no" },
  { q: "Adult children from prior relationships?", key: "has_adult_children_prior", type: "yes-no" },
  { q: "Had a will?", key: "has_will", type: "yes-no" },
  { q: "Had a trust?", key: "has_trust", type: "yes-no" },
  { q: "Owned real estate?", key: "has_real_estate", type: "yes-no" },
  { q: "Owned vehicles?", key: "has_vehicles", type: "yes-no" },
  { q: "Owned a business or had business interests?", key: "has_business", type: "yes-no" },
  { q: "Had retirement accounts?", key: "has_retirement", type: "yes-no" },
  { q: "Were they a veteran or active military?", key: "is_veteran", type: "yes-no" },
  { q: "Had life insurance policies?", key: "has_life_insurance", type: "yes-no" },
  { q: "Were they employed at time of death?", key: "was_employed", type: "yes-no" },
  { q: "Receiving Social Security benefits?", key: "receives_social_security", type: "yes-no" },
  { q: "On Medicare or Medicaid?", key: "on_medicare_medicaid", type: "yes-no" },
  { q: "Had a safe deposit box?", key: "has_safe_deposit_box", type: "yes-no" },
  { q: "Known debts?", key: "has_debts", type: "yes-no" },
  { q: "Digital assets or cryptocurrency?", key: "has_digital_assets", type: "yes-no" },
  { q: "Pending lawsuits or legal claims?", key: "has_pending_litigation", type: "yes-no" },
  { q: "Minor dependents requiring guardianship?", key: "has_minor_dependents", type: "yes-no" },
];

const EXTRACTION_PROMPT = `You are an AI assistant helping process estate documents to extract information for an estate intake form.

Extract structured data from the provided documents and map it to the following intake fields. For each field:
- Provide the extracted value
- Rate confidence (0.0-1.0) based on document clarity and how explicitly the information is stated
- Explain the extraction source/reasoning

Extract ONLY information explicitly stated in documents. If a field cannot be extracted, omit it rather than guessing.

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
  "extraction_summary": "Brief summary of what was found across documents",
  "total_fields_extracted": 5,
  "overall_confidence": 0.87
}`;

export const handler = async (event) => {
  try {
    const { estateId, filePaths } = JSON.parse(event.body);

    if (!estateId || !filePaths || filePaths.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "estateId and filePaths required" }),
      };
    }

    // Update extraction status to processing
    await supabase
      .from("estate_document_extractions")
      .update({ extraction_status: "processing" })
      .in("file_path", filePaths);

    // Prepare document content for Claude
    const documentContents = [];

    for (const filePath of filePaths) {
      try {
        // Download from Supabase storage
        const { data, error } = await supabase.storage
          .from("estate-documents")
          .download(filePath);

        if (error) throw error;

        // Convert file to base64
        const buffer = await data.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const fileName = filePath.split("/").pop();
        const fileExt = fileName.split(".").pop().toLowerCase();

        // Determine media type
        let mediaType = "application/octet-stream";
        if (fileExt === "pdf") mediaType = "application/pdf";
        else if (["jpg", "jpeg"].includes(fileExt)) mediaType = "image/jpeg";
        else if (fileExt === "png") mediaType = "image/png";

        documentContents.push({
          type: "document",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64,
          },
          document_title: fileName,
        });
      } catch (err) {
        console.error(`Error processing file ${filePath}:`, err);
        // Continue with other files
      }
    }

    if (documentContents.length === 0) {
      throw new Error("No documents could be processed");
    }

    // Call Claude API for extraction
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [...documentContents, { type: "text", text: EXTRACTION_PROMPT }],
        },
      ],
    });

    // Parse Claude response
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response (handle markdown code blocks)
    let extractionResult;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      extractionResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
    } catch (e) {
      console.error("Failed to parse Claude response:", responseText);
      throw new Error("Failed to parse extraction results");
    }

    // Save results to database
    for (const filePath of filePaths) {
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
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        extraction: extractionResult,
        filesProcessed: filePaths.length,
      }),
    };
  } catch (error) {
    console.error("Extraction error:", error);

    // Try to update error status
    try {
      const { estateId } = JSON.parse(event.body);
      if (estateId) {
        await supabase
          .from("estate_document_extractions")
          .update({
            extraction_status: "failed",
            extraction_error: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq("estate_id", estateId)
          .eq("extraction_status", "processing");
      }
    } catch (e) {
      console.error("Failed to update error status:", e);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Extraction failed",
      }),
    };
  }
};
