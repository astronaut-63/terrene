import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, errorMessage } from './apiClient';
afterEach(() => vi.unstubAllGlobals());
it('preserves useful FastAPI and legacy errors without rendering internal traces', () => {
  expect(errorMessage({ detail: 'Rate limit reached.' }, 'Failed')).toBe('Rate limit reached.');
  expect(errorMessage({ error: 'Provider down.' }, 'Failed')).toBe('Provider down.');
  expect(errorMessage({ message: 'Try later.' }, 'Failed')).toBe('Try later.');
  expect(errorMessage({ detail: [{ msg: 'invalid' }] }, 'Failed')).toContain('Check the entered values');
  expect(errorMessage({ detail: 'Traceback SQLAlchemy internal secret' }, 'Failed')).toBe('Failed');
});
it('distinguishes a non-JSON proxy failure, network outage and invalid successful response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('bad gateway', { status: 502 })).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response('invalid', { status: 200 })));
  await expect(apiRequest('/api/test')).rejects.toThrow('unavailable');
  await expect(apiRequest('/api/test')).rejects.toThrow('could not be reached');
  await expect(apiRequest('/api/test')).rejects.toThrow('invalid data');
});
it('discards a late JSON body after cancellation', async () => {
  let finish!: (body: unknown) => void; const controller = new AbortController();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) }));
  const pending = apiRequest('/api/test', { signal: controller.signal });
  await Promise.resolve(); controller.abort(); finish({ stale: true });
  await expect(pending).rejects.toThrow('Request cancelled');
});
