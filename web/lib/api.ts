const API_BASE_URL =
  process.env.FORENSIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8080";

const API_AUTH_TOKEN = process.env.FORENSIC_API_AUTH_TOKEN || "";

export function buildBackendUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

export function buildBackendHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  if (API_AUTH_TOKEN && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${API_AUTH_TOKEN}`);
  }

  return headers;
}

export type ApiResult<T> =
  | { data: T; error: null; status: number }
  | { data: null; error: string; status: number };

const UNREACHABLE = "The forensic API is unreachable. Check that the Go backend is running.";

/**
 * Server-side fetch that keeps the failure reason. Pages use it to tell "not found"
 * apart from "timed out" or "backend down" instead of treating every error as empty.
 */
export async function apiResult<T>(path: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(buildBackendUrl(path), {
      cache: "no-store",
      headers: buildBackendHeaders(),
    });
  } catch {
    return { data: null, error: UNREACHABLE, status: 0 };
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        detail = body.error;
      }
    } catch {}
    return { data: null, error: detail, status: response.status };
  }

  return { data: (await response.json()) as T, error: null, status: response.status };
}

/** Returns the data, or null for any failure. Use only where a failure can be shown as empty. */
export async function maybeApiFetch<T>(path: string): Promise<T | null> {
  const result = await apiResult<T>(path);
  return result.data;
}
