async function readError(response: Response) {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) {
      detail = body.error;
    }
  } catch {}
  return detail;
}

/** Browser-side GET through the Next.js proxy at /api/forensic. */
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
    throw new Error(await readError(response));
  }
  return (await response.json()) as T;
}

/** Browser-side JSON POST through the Next.js proxy. */
export async function clientApiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/forensic${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as T;
}
