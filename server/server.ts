import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { calculateSolar } from './solar.js';
import { normalizeQuery, searchNominatim } from './geocoder.js';

const port = Number(process.env.PORT ?? 3001);
const json = (res: ServerResponse, status: number, body: unknown) => { const text = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' }); res.end(text); };
const numberParam = (value: string | null) => value === null || value.trim() === '' ? NaN : Number(value);

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'terrene-backend' });
  if (url.pathname === '/api/locations/search') {
    const query = normalizeQuery(url.searchParams.get('q'));
    if (!query) return json(res, 400, { error: 'Query q is required and must be 1–256 characters.' });
    try { return json(res, 200, { results: await searchNominatim(query, { signal: req.signal }) }); } catch (error) { return json(res, error instanceof Error && error.message.includes('rate-limited') ? 429 : 502, { error: error instanceof Error ? error.message : 'Location search failed.' }); }
  }
  if (url.pathname === '/api/solar') {
    const latitude = numberParam(url.searchParams.get('lat')); const longitude = numberParam(url.searchParams.get('lon')); const date = url.searchParams.get('date') ?? '';
    try { return json(res, 200, calculateSolar(date, latitude, longitude)); } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : 'Invalid solar request.' }); }
  }
  return json(res, 404, { error: 'Not found.' });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/server.js')) createServer((req, res) => { void handleRequest(req, res); }).listen(port, () => console.log(`Terrene backend listening on http://localhost:${port}`));
