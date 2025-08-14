
// lib/extraction-queue.ts
// Placeholder for a real queuing system like Google Cloud Tasks or Pub/Sub.

interface ExtractionJobPayload {
  orgId: string;
  invoiceId: string; // The SHA256 digest
  storagePath: string;
}

/**
 * Enqueues a job for asynchronous extraction.
 * In a real application, this function would make an API call to a service
 * that creates a job in Google Cloud Tasks or publishes a message to Pub/Sub.
 *
 * For this prototype, it will just log the action to the console.
 * It's designed to fail gracefully if the queuing service isn't available.
 */
export async function enqueueExtractionJob(payload: ExtractionJobPayload): Promise<void> {
  console.log('[Queue Stub] Enqueueing extraction job for:', payload);
  
  // In a real implementation:
  /*
  try {
    const response = await fetch('https://your-cloud-run-worker-url/enqueue-extraction', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Add auth headers if your worker is protected
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to enqueue job: ${response.status} ${errorText}`);
    }
    console.log('[Queue] Successfully enqueued job.');
  } catch (error) {
    console.error('[Queue] Error enqueueing job:', error);
    // The calling function should handle this error gracefully.
    throw error;
  }
  */

  // For now, we resolve successfully to simulate that the endpoint
  // should not fail even if the queuing system has a hiccup.
  return Promise.resolve();
}
