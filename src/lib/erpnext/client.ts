
// src/lib/erpnext/client.ts
'use server';

import { logError, logInfo } from "@/lib/logger";

const RETRY_COUNT = 3;
const BASE_DELAY_MS = 800; // Start lower than 1000 to fit within 1-3s with jitter
const REQ_TIMEOUT_MS = 30_000;

type JsonLike = Record<string, any> | any[];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withJitter(base: number) {
  const jitter = Math.floor(Math.random() * (base * 0.3)); // ±30%
  return base + jitter;
}

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
    // _server_messages is typically a stringified JSON array: '["{...json...}"]'
    if (j._server_messages) {
      try {
        const arr = JSON.parse(j._server_messages) as string[];
        const messages = arr
          .map((s) => {
            try {
              const o = JSON.parse(s);
              return o.message || o.msg || o._error_message || s;
            } catch {
              return s;
            }
          })
          .filter(Boolean)
          .join(" | ");
        if (messages) return messages;
      } catch {
        /* ignore */
      }
    }
    if (j.exception) return j.exception;
    if (j.message) return typeof j.message === "string" ? j.message : JSON.stringify(j.message);
    if (j._error_message) return j._error_message;
    return rawText;
  } catch {
    return rawText;
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
    const t = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        cache: "no-store", // Important for Next.js to avoid implicit caching
        ...init,
        headers,
        signal: controller.signal,
      });

      clearTimeout(t);

      if (!res.ok) {
        // Retry on 429 (Too Many Requests) or 5xx server errors
        if (res.status === 429 || res.status >= 500) {
          const retryAfterHeader = res.headers.get("retry-after");
          let delay =
            retryAfterHeader && /^\d+$/.test(retryAfterHeader)
              ? parseInt(retryAfterHeader, 10) * 1000
              : withJitter(BASE_DELAY_MS * Math.pow(2, attempt - 1));

          logInfo(
            { workflow: "erpnext-client", action: "retry", docType: "Unknown", status: res.status },
            `Retrying ${path} in ${delay}ms (attempt ${attempt}/${RETRY_COUNT})`
          );

          if (attempt === RETRY_COUNT) {
            const text = await res.text();
            const details = extractErpErrorDetails(text);
            throw new Error(`ERPNext request failed after retries: ${details}`);
          }
          await sleep(delay);
          continue;
        }

        // For other 4xx errors, fail immediately with a decoded message
        const text = await res.text();
        const details = extractErpErrorDetails(text);
        logError({ workflow: "erpnext-client", action: "fetch-fail", docType: "Unknown", status: res.status }, details, path);
        throw new Error(details);
      }

      // Handle successful responses
      const text = await res.text();
      if (!text) return { ok: true }; // Handle empty responses (e.g., from DELETE)

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        // ERPNext can sometimes return plain text
        return text;
      }
      return unwrapErpResponse(json);

    } catch (err: any) {
      clearTimeout(t);
      const aborted = err?.name === "AbortError";
      const msg = aborted ? `Timeout after ${REQ_TIMEOUT_MS}ms` : err.message || String(err);
      logInfo({ workflow: "erpnext-client", action: "fetch-exception", docType: "Unknown", attempt }, `${path} → ${msg}`);

      if (attempt === RETRY_COUNT) {
        throw new Error(`Request to ${path} failed after ${RETRY_COUNT} attempts: ${msg}`);
      }
      await sleep(withJitter(BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }

  // This should theoretically be unreachable
  throw new Error("Unreachable code in erpnextFetch");
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
