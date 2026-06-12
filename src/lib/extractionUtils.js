// Merge extracted data with existing answers
export function mergeExtractionWithAnswers(extractedFields, existingAnswers = {}) {
  const merged = { ...existingAnswers };

  Object.entries(extractedFields || {}).forEach(([key, data]) => {
    // Only fill in if user hasn't already provided an answer
    if (!existingAnswers[key]) {
      merged[key] = data.value;
    }
  });

  return merged;
}

// Format confidence score for UI display
export function formatConfidenceScore(score) {
  if (!score) return { label: "Unknown", color: "gray" };

  if (score >= 0.8) {
    return { label: "High", color: "green", score: Math.round(score * 100) };
  } else if (score >= 0.5) {
    return { label: "Medium", color: "yellow", score: Math.round(score * 100) };
  } else {
    return { label: "Low", color: "orange", score: Math.round(score * 100) };
  }
}

// Convert extraction status to readable text
export function extractionStatusToLabel(status) {
  const labels = {
    pending: "Waiting to process...",
    processing: "Analyzing documents...",
    completed: "Complete",
    failed: "Failed to extract",
    partial: "Partially extracted",
  };
  return labels[status] || status;
}

// Get document source display text
export function getDocumentSourceDisplay(source) {
  if (!source) return "Unknown source";
  // Format: "Found in Will, page 2"
  return source;
}

// Filter extracted fields with confidence above threshold
export function filterByConfidence(extractedFields, threshold = 0.5) {
  return Object.fromEntries(
    Object.entries(extractedFields || {})
      .filter(([_, data]) => (data.confidence ?? 0) >= threshold)
      .map(([key, data]) => [key, data])
  );
}

// Get extraction summary stats
export function getExtractionStats(extractedFields) {
  const fields = extractedFields || {};
  const entries = Object.entries(fields);

  const highConfidence = entries.filter(([_, d]) => (d.confidence ?? 0) >= 0.8).length;
  const mediumConfidence = entries.filter(([_, d]) => (d.confidence ?? 0) >= 0.5 && (d.confidence ?? 0) < 0.8).length;
  const lowConfidence = entries.filter(([_, d]) => (d.confidence ?? 0) < 0.5).length;

  return {
    total: entries.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    averageConfidence: entries.length > 0
      ? entries.reduce((sum, [_, d]) => sum + (d.confidence ?? 0), 0) / entries.length
      : 0,
  };
}
