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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildBackendUrl(path), {
    ...init,
    cache: "no-store",
    headers: buildBackendHeaders(init?.headers),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        detail = body.error;
      }
    } catch {}
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export async function maybeApiFetch<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}
