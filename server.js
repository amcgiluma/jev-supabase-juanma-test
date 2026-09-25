import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildRequest, validatePayload } from './request.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
export { buildRequest, validatePayload } from './request.js';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function send(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
export function createServer({ apiKey = process.env.JEV_API_KEY, apiUrl = process.env.JEV_API_URL || 'https://thejevai.com/v1/systemone', fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && pathname === '/api/status') return send(res, 200, { live: Boolean(apiKey || process.env.JEV_API_URL) });
    if (req.method === 'POST' && pathname === '/api/analyze') {
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 30000) return send(res, 413, { error: 'Request is too long for this demo.' });
        }
        let input;
        try { input = JSON.parse(raw); } catch { return send(res, 400, { error: 'Request body is not valid JSON.' }); }
        let payload;
        if (input?.payload !== undefined) payload = input.payload;
        else {
          if (typeof input?.message !== 'string' || input.message.trim().length < 8 || input.message.length > 6000) return send(res, 400, { error: 'Enter a ticket between 8 and 6,000 characters.' });
          payload = buildRequest(input.message.trim());
        }
        const validationError = validatePayload(payload);
        if (validationError) return send(res, 400, { error: validationError });
        if (!apiKey && !process.env.JEV_API_URL) return send(res, 503, { error: 'Set JEV_API_KEY on the server to run a live analysis.' });
        const headers = { 'content-type': 'application/json' };
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;
        const upstream = await fetchImpl(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
        const result = await upstream.json();
        if (!upstream.ok) return send(res, upstream.status, { error: result?.error?.message || result?.detail || `Jev returned HTTP ${upstream.status}.` });
        if (!isObject(result?.answers) || Object.keys(payload.questions).some(name => !Object.hasOwn(result.answers, name) || !isObject(result.answers[name]))) return send(res, 502, { error: 'The API response did not contain every requested answer.' });
        return send(res, 200, { result, request: payload });
      } catch (error) {
        return send(res, error?.name === 'TimeoutError' ? 504 : 502, { error: error?.name === 'TimeoutError' ? 'Jev timed out after 30 seconds.' : 'Could not reach Jev. Check the API URL and server connection.' });
      }
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    const safePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^(index\.html|app\.js|request\.js|styles\.css|assets\/[a-z0-9-]+\.(svg|png))$/.test(safePath)) return send(res, 404, { error: 'Not found.' });
    try {
      const body = await readFile(path.join(root, safePath));
      res.writeHead(200, { 'content-type': mime[path.extname(safePath)], 'cache-control': 'no-store' });
      res.end(body);
    } catch { send(res, 404, { error: 'Not found.' }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Security triage lab: http://127.0.0.1:${process.env.PORT || 3000}`));
}
