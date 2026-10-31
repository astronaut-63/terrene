export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); this.name = 'ApiError'; }
}

export function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  for (const key of ['detail', 'error', 'message']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      if (/traceback|stack trace|sqlalchemy|sql statement|exception in|file \"/i.test(value)) return fallback;
      if (/Routing is not configured/i.test(value)) return 'Routing is unavailable because its provider is not configured.';
      if (/authentication failed/i.test(value)) return 'The provider could not authenticate this request. Try again later.';
      return value.slice(0, 320);
    }
    if (key === 'detail' && Array.isArray(value)) return 'Check the entered values and try again.';
  }
  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers: { Accept: 'application/json', ...options.headers } });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    throw new ApiError('The service could not be reached. Check your connection and try again.');
  }
  if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new ApiError(response.ok ? 'The service returned invalid data.' : 'The service is unavailable. Try again later.', response.status); }
  if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  if (!response.ok) throw new ApiError(errorMessage(body, 'The request failed. Try again later.'), response.status);
  return body as T;
}

export const jsonRequest = (body: unknown, signal?: AbortSignal, method = 'POST'): RequestInit => ({
  method, signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';
