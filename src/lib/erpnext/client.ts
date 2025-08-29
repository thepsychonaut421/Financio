
// src/lib/erpnext/client.ts
'use server';

import { logError, logInfo } from "@/lib/logger";

const RETRY_COUNT = 3;
const BASE_DELAY_MS = 800; 
const REQ_TIMEOUT_MS = 30_000;

type JsonLike = Record<string, any> | any[];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withJitter(base: number) {
  const jitter = Math.floor(Math.random() * (base * 0.3)); // ±30%
  return base + jitter;
}

const safeParseJSON = (text: string) => { 
  try { 
    return JSON.parse(text); 
  } catch { 
    return { _error: 'Invalid JSON response from server', _raw: text.slice(0, 500) }; 
  } 
};

const httpStatusLabel = (status: number) => {
  const labels: Record<number, string> = {
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    413: "Payload Too Large", 429: "Too Many Requests", 500: "Internal Server Error",
    502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"
  };
  return labels[status] || `HTTP ${status}`;
};

const trimHTML = (html: string) => html.replace(/\s+/g, ' ').replace(/<[^>]*>/g, '').slice(0, 300);

function unwrapErpResponse(json: any) {
  if (json == null) return json;
  if (typeof json === "object") {
    if ("data" in json && json.data !== undefined) return json.data;
    if ("message" in json && json.message !== undefined) return json.message;
    if ("docs" in json && json.docs !== undefined) return json.docs; // rare
  }
  return json;
}

function extractErpErrorDetails(rawText: string): string {
  try {
    const j = JSON.parse(rawText);
    if (j._server_messages) {
      try {
        const arr = JSON.parse(j._server_messages) as string[];
        const messages = arr.map((s) => { try { const o = JSON.parse(s); return o.message || o.msg || o._error_message || s; } catch { return s; } }).filter(Boolean).join(" | ");
        if (messages) return messages;
      } catch { /* ignore */ }
    }
    if (j.exception) return j.exception;
    if (j.message) return typeof j.message === "string" ? j.message : JSON.stringify(j.message);
    if (j._error_message) return j._error_message;
    return rawText.slice(0, 500); // Truncate to avoid overly long errors
  } catch {
    return rawText.slice(0, 500);
  }
}

/**
 * Low-level ERPNext fetch client (server-only).
 */
export async function erpnextFetch(path: string, init: RequestInit = {}): Promise<JsonLike> {
  const url = `${process.env.ERPNEXT_BASE_URL}${path}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`,
    ...(init.headers || {}),
  };

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, headers, signal: controller.signal, cache: 'no-store' });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();

      if (!response.ok) {
        let errorPayload;
        if (contentType.includes('application/json')) {
          errorPayload = { details: extractErpErrorDetails(rawText) };
        } else {
          errorPayload = { error: httpStatusLabel(response.status), html: trimHTML(rawText) };
        }
        
        // Retry logic for specific statuses
        if (response.status === 429 || response.status >= 500) {
            if (attempt < RETRY_COUNT) {
                const delay = withJitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));
                logInfo({ workflow: "erpnext-client", action: "retry", status: response.status, attempt }, `Retrying after ${delay}ms...`);
                await sleep(delay);
                continue; // Retry the loop
            }
        }
        // If not retrying, throw the error
        throw new Error(JSON.stringify({ status: response.status, ...errorPayload }));
      }

      if (!rawText) return { ok: true };
      const json = safeParseJSON(rawText);
      return unwrapErpResponse(json);

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt === RETRY_COUNT) {
         let parsedError;
         try {
             parsedError = JSON.parse(err.message);
         } catch {
             parsedError = { message: err.message };
         }
         logError({ workflow: "erpnext-client", action: "fetch-fail", attempt }, parsedError, path);
         throw new Error(parsedError.message || err.message);
      }
    }
  }
  // This part should be unreachable if the loop logic is correct
  throw new Error("erpnexFetch failed after all retries.");
}


/** CRUD helpers that benefit from the robust fetch client */
export async function getResource(docType: string, name: string) {
  return erpnextFetch(`/api/resource/${docType}/${encodeURIComponent(name)}`, { method: "GET" });
}

export async function findResource(docType: string, filters: any[][]) {
  const params = new URLSearchParams({
    filters: JSON.stringify(filters),
    limit_page_length: "1",
  });
  const results = await erpnextFetch(`/api/resource/${docType}?${params}`, { method: "GET" });
  return Array.isArray(results) ? results[0] : undefined;
}

export async function createResource(docType: string, doc: object) {
  return erpnextFetch(`/api/resource/${docType}`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
}

export async function updateResource(docType: string, name: string, doc: object) {
  return erpnextFetch(`/api/resource/${docType}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(doc),
  });
}

export async function submitResource(docType: string, name: string) {
  return callMethod("frappe.client.submit", { doctype: docType, name });
}

export async function callMethod(method: string, args: object) {
  return erpnextFetch(`/api/method/${method}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}
