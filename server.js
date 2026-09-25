import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const routeCriteria = {
  identity_access: 'MFA reset, SSO, login, account access, or credential recovery',
  security_incident: 'Suspicious access, phishing, exposed credentials, or possible compromise',
  data_privacy: 'Data access, deletion, privacy rights, or sensitive data handling',
  platform_security: 'Security configuration, vulnerabilities, audit logs, or infrastructure controls',
  other: 'Unclear or unrelated request that needs manual triage'
};
export function buildRequest(message) {
  return {
    model: 'jev-latest',
    state: { ticket: message },
    questions: {
      route: { type: 'choice', instructions: 'Which security workstream should first triage this ticket? Choose other if the request does not clearly fit.', criteria: routeCriteria },
      urgency: { type: 'score', instructions: 'How urgent is a human response to this ticket, based only on the stated facts?', criteria: [
        'Low: routine request with no stated time pressure or active risk',
        'Moderate: access or policy issue affecting one person, with no sign of compromise',
        'High: blocked critical work, repeated failures, or plausible security exposure',
        'Critical: active compromise, broad impact, or ongoing sensitive data exposure'
      ] },
      human_review: { type: 'noul', instructions: 'Does this ticket need human review before any account, access, or security action is taken?', criteria: {
        true: 'Identity verification, privileged changes, possible compromise, or uncertain facts require a person',
        false: 'Only a safe, informational response or routine routing is needed'
      } }
    }
  };
}
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
          if (raw.length > 12000) return send(res, 413, { error: 'Ticket is too long for this demo.' });
        }
        const { message } = JSON.parse(raw);
        if (typeof message !== 'string' || message.trim().length < 8 || message.length > 6000) return send(res, 400, { error: 'Enter a ticket between 8 and 6,000 characters.' });
        if (!apiKey && !process.env.JEV_API_URL) return send(res, 503, { error: 'Set JEV_API_KEY on the server to run a live analysis.' });
        const payload = buildRequest(message.trim());
        const headers = { 'content-type': 'application/json' };
        if (apiKey) headers.authorization = `Bearer ${apiKey}`;
        const upstream = await fetchImpl(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
        const result = await upstream.json();
        if (!upstream.ok) return send(res, upstream.status, { error: result?.error?.message || result?.detail || `Jev returned HTTP ${upstream.status}.` });
        if (!result?.answers?.route || !result?.answers?.urgency || !result?.answers?.human_review) return send(res, 502, { error: 'The API response did not contain all three answers.' });
        return send(res, 200, { result, request: payload });
      } catch (error) {
        return send(res, error?.name === 'TimeoutError' ? 504 : 502, { error: error?.name === 'TimeoutError' ? 'Jev timed out after 30 seconds.' : 'Could not reach Jev. Check the API URL and server connection.' });
      }
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    const safePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^(index\.html|app\.js|styles\.css|assets\/[a-z0-9-]+\.(svg|png))$/.test(safePath)) return send(res, 404, { error: 'Not found.' });
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
