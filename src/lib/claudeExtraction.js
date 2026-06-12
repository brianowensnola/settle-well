import { supabase } from './supabase'

// Upload files and initiate extraction
export async function initiateExtraction(estateId, filePaths) {
  try {
    // Create extraction records in database
    const extractionRecords = filePaths.map((filePath) => ({
      estate_id: estateId,
      file_path: filePath,
      file_name: filePath.split('/').pop(),
      file_type: filePath.split('.').pop(),
      extraction_status: 'pending',
    }));

    const { error } = await supabase
      .from('estate_document_extractions')
      .insert(extractionRecords);

    if (error) throw error;

    // Call Netlify function to start extraction
    const response = await fetch('/.netlify/functions/extract-estate-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        estateId,
        filePaths,
      }),
    });

    if (!response.ok) {
      throw new Error(`Extraction request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error initiating extraction:', error);
    throw error;
  }
}

// Poll extraction status
export async function pollExtractionStatus(estateId, maxWaitMs = 300000) {
  const pollIntervalMs = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data, error } = await supabase
      .from('estate_document_extractions')
      .select('*')
      .eq('estate_id', estateId);

    if (error) throw error;

    if (data && data.length > 0) {
      const allCompleted = data.every((r) => r.extraction_status !== 'pending' && r.extraction_status !== 'processing');
      const hasErrors = data.some((r) => r.extraction_status === 'failed');
      const allSuccessful = data.every((r) => r.extraction_status === 'completed');

      if (allCompleted) {
        return {
          status: allSuccessful ? 'completed' : 'partial',
          records: data,
          hasErrors,
        };
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Extraction polling timeout');
}

// Merge all extractions into single answer set
export function mergeAllExtractions(extractionRecords) {
  const mergedAnswers = {};
  const mergedConfidence = {};
  const mergedSources = {};

  extractionRecords.forEach((record) => {
    if (record.extraction_status === 'completed' && record.extracted_answers) {
      Object.entries(record.extracted_answers).forEach(([key, fieldData]) => {
        // Take highest confidence if multiple documents have the same field
        if (!mergedAnswers[key] || (fieldData.confidence ?? 0) > (mergedConfidence[key] ?? 0)) {
          mergedAnswers[key] = fieldData.value;
          mergedConfidence[key] = fieldData.confidence ?? 0;
          mergedSources[key] = fieldData.source;
        }
      });
    }
  });

  return {
    answers: mergedAnswers,
    confidence: mergedConfidence,
    sources: mergedSources,
  };
}

// Get extraction errors
export function getExtractionErrors(extractionRecords) {
  return extractionRecords
    .filter((r) => r.extraction_status === 'failed')
    .map((r) => ({
      fileName: r.file_name,
      error: r.extraction_error,
    }));
}

// Subscribe to extraction status updates (real-time)
export function subscribeToExtractionStatus(estateId, callback) {
  const subscription = supabase
    .from('estate_document_extractions')
    .on('*', (payload) => {
      if (payload.new.estate_id === estateId) {
        callback(payload);
      }
    })
    .subscribe();

  return subscription;
}

// Unsubscribe from extraction updates
export async function unsubscribeFromExtractionStatus(subscription) {
  if (subscription) {
    await supabase.removeSubscription(subscription);
  }
}
