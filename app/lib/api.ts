export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const signal = init?.signal ?? AbortSignal.timeout(15_000);
  const response = await fetch(url, { ...init, signal });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? `: ${body.error}` : "";
    } catch {
      // Fall back to status code when the API does not return JSON.
    }
    throw new Error(`${url} returned ${response.status}${detail}`);
  }
  if (response.status === 204) return undefined as T;
  try {
    return await (response.json() as Promise<T>);
  } catch {
    throw new Error(`${url} returned non-JSON response`);
  }
}
