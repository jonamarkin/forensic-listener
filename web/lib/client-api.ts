export async function clientApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/forensic${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) {
        detail = body.error;
      }
    } catch {
      // Fall back to the HTTP status text.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}
