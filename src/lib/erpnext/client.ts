// src/lib/erpnext/client.ts
import { logError, logInfo } from "@/lib/logger";

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;

/**
 * A low-level REST client for ERPNext with built-in authentication,
 * retries, and rate-limiting awareness.
 *
 * @param path The API path (e.g., /api/resource/Supplier)
 * @param init The standard fetch RequestInit object.
 * @returns The JSON response from the server.
 * @throws An error if the request fails after all retries.
 */
export async function erpnextFetch(path: string, init: RequestInit = {}): Promise<any> {
    const url = `${process.env.ERPNEXT_BASE_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
        ...(init.headers || {})
    };

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
        try {
            const response = await fetch(url, { ...init, headers });

            if (!response.ok) {
                // Rate limit or server error, worth retrying
                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`Retryable error: ${response.status}`);
                }

                // Other client errors, fail immediately
                const errorText = await response.text();
                let errorDetails = errorText;
                try {
                    const errorJson = JSON.parse(errorText);
                     if (errorJson.exception) {
                        errorDetails = errorJson.exception;
                    } else if (errorJson._server_messages) {
                        const serverMessage = JSON.parse(errorJson._server_messages[0]);
                        errorDetails = serverMessage.message || errorText;
                    }
                } catch (e) {
                    // Not a JSON error, use the raw text
                }
                
                logError({ workflow: 'erpnext-client', docType: 'Unknown', action: 'fetch-fail' }, errorDetails, `Request to ${path} failed with status ${response.status}`);
                throw new Error(`ERPNext request failed: ${errorDetails}`);
            }

            // Handle successful but potentially empty responses
            const responseText = await response.text();
            if (!responseText) {
                return { ok: true };
            }
            return JSON.parse(responseText);

        } catch (error: any) {
            logInfo({ workflow: 'erpnext-client', docType: 'Unknown', action: 'fetch-retry' }, `Attempt ${attempt} for ${path} failed: ${error.message}`);
            if (attempt === RETRY_COUNT) {
                throw new Error(`Request to ${path} failed after ${RETRY_COUNT} attempts: ${error.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt - 1)));
        }
    }
}

/**
 * Fetches a single resource by its name.
 * @param docType The doctype of the resource.
 * @param name The name/ID of the resource.
 * @returns The resource data.
 */
export async function getResource(docType: string, name: string) {
    return erpnextFetch(`/api/resource/${docType}/${encodeURIComponent(name)}`, { method: 'GET' });
}

/**
* Finds a resource based on a set of filters.
* @param docType The doctype to query.
* @param filters An array of filters for the query.
* @returns The first matching resource or undefined.
*/
export async function findResource(docType: string, filters: any[][]) {
   const params = new URLSearchParams({ filters: JSON.stringify(filters), limit_page_length: '1' });
   const result = await erpnextFetch(`/api/resource/${docType}?${params}`, { method: 'GET' });
   return result?.data?.[0];
}

/**
 * Creates a new resource.
 * @param docType The doctype of the resource.
 * @param doc The document payload.
 * @returns The created resource data.
 */
export async function createResource(docType: string, doc: object) {
    return erpnextFetch(`/api/resource/${docType}`, {
        method: 'POST',
        body: JSON.stringify(doc)
    });
}

/**
 * Updates an existing resource by its name.
 * @param docType The doctype of the resource.
 * @param name The name/ID of the resource.
 * @param doc The partial document payload for the update.
 * @returns The updated resource data.
 */
export async function updateResource(docType: string, name: string, doc: object) {
    return erpnextFetch(`/api/resource/${docType}/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify(doc)
    });
}

/**
 * Submits a document (e.g., from Draft to Submitted).
 * @param docType The doctype of the document.
 * @param name The name/ID of the document.
 * @returns The submitted document data.
 */
export async function submitResource(docType: string, name: string) {
    return callMethod('frappe.client.submit', {
      doctype: docType,
      name: name
    });
}

/**
 * Calls a remote method on the ERPNext server.
 * @param method The full dotted path of the method.
 * @param args The arguments for the method.
 * @returns The result of the method call.
 */
export async function callMethod(method: string, args: object) {
    return erpnextFetch(`/api/method/${method}`, {
        method: 'POST',
        body: JSON.stringify(args)
    });
}
