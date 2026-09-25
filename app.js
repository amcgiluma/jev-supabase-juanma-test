import { buildRequest, validatePayload } from './request.js';

const samples = {
  mfa: {
    text: 'Hi Security, I lost the phone that has my authenticator app. I cannot sign in to my Supabase account, and I need an MFA reset to get back to work. My team has a release this afternoon. What do you need from me to verify my identity?',
    preview: { route: { choice: 'identity_access', confidence: .91, probabilities: { identity_access: .93, security_incident: .03, data_privacy: .01, platform_security: .01, other: .02 } }, urgency: { score: 1.62, confidence: .53, probabilities: { 0: .03, 1: .39, 2: .51, 3: .07 } }, human_review: { noul: .97 } }
  },
  phishing: {
    text: 'I received an unexpected sign-in notification from a location I do not recognize. I clicked a link in a suspicious email earlier today. Please check whether someone accessed my account and tell me what to do next.',
    preview: { route: { choice: 'security_incident', confidence: .89, probabilities: { identity_access: .04, security_incident: .91, data_privacy: .01, platform_security: .02, other: .02 } }, urgency: { score: 2.55, confidence: .64, probabilities: { 0: .01, 1: .05, 2: .32, 3: .62 } }, human_review: { noul: .99 } }
  },
  privacy: {
    text: 'A customer has asked for a copy of all personal data associated with their account. I need to understand the approved export process and who can authorize it. This is not urgent, but I want to make sure we handle it correctly.',
    preview: { route: { choice: 'data_privacy', confidence: .87, probabilities: { identity_access: .01, security_incident: .01, data_privacy: .90, platform_security: .03, other: .05 } }, urgency: { score: .67, confidence: .58, probabilities: { 0: .42, 1: .50, 2: .07, 3: .01 } }, human_review: { noul: .94 } }
  }
};
const routeLabels = { identity_access: 'Identity & access', security_incident: 'Security incident', data_privacy: 'Data & privacy', platform_security: 'Platform security', other: 'Other / manual triage' };
const urgencyLabels = ['Low', 'Moderate', 'High', 'Critical'];
const ticket = document.querySelector('#ticket');
const count = document.querySelector('#char-count');
const content = document.querySelector('#result-content');
const empty = document.querySelector('#result-empty');
const state = document.querySelector('#result-state');
const requestJson = document.querySelector('#request-json');
const validation = document.querySelector('#request-validation');
const responseBody = document.querySelector('#response-body');
const responseBadge = document.querySelector('#response-badge');
let selected = 'mfa';
let lastPayload = null;
let lastRaw = null;
let editorDirty = false;
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function pct(number) { return `${Math.round(Math.max(0, Math.min(1, Number(number) || 0)) * 100)}%`; }
function showView(view) {
  document.querySelector('#lab-view').hidden = view !== 'lab';
  document.querySelector('#playbook-view').hidden = view !== 'playbook';
  document.querySelector('#crumb-name').textContent = view === 'lab' ? 'Triage lab' : 'Decision playbook';
  document.querySelectorAll('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
}
document.querySelectorAll('.nav-item').forEach(node => node.addEventListener('click', () => showView(node.dataset.view)));
document.querySelector('#learn-more').addEventListener('click', event => { event.preventDefault(); showView('playbook'); });
function lineNumbers() {
  document.querySelector('#request-lines').textContent = Array.from({ length: requestJson.value.split('\n').length }, (_, index) => index + 1).join('\n');
}
function readEditor() {
  try {
    const payload = JSON.parse(requestJson.value);
    const error = validatePayload(payload);
    return error ? { error } : { payload };
  } catch (error) { return { error: `Invalid JSON: ${error.message}` }; }
}
function refreshEditor() {
  lineNumbers();
  const { payload, error } = readEditor();
  validation.textContent = error || `${Object.keys(payload.questions).length} question${Object.keys(payload.questions).length === 1 ? '' : 's'} · valid JSON · ready to run`;
  validation.classList.toggle('invalid', Boolean(error));
  document.querySelector('#run-json').disabled = Boolean(error);
  document.querySelector('#analyze-btn').disabled = Boolean(error);
  document.querySelector('#preview-btn').disabled = editorDirty || !selected;
  document.querySelector('#editor-dirty').hidden = !editorDirty;
  document.querySelector('#request-mode-label').textContent = payload?.model || 'custom JSON';
}
function setEditor(payload) {
  requestJson.value = JSON.stringify(payload, null, 2);
  editorDirty = false;
  refreshEditor();
}
function selectSample(name) {
  selected = name;
  ticket.value = samples[name].text;
  count.textContent = `${ticket.value.length} / 6000`;
  document.querySelectorAll('.scenario').forEach(node => node.classList.toggle('selected', node.dataset.sample === name));
  setEditor(buildRequest(ticket.value));
}
document.querySelectorAll('.scenario').forEach(node => node.addEventListener('click', () => selectSample(node.dataset.sample)));
ticket.addEventListener('input', () => {
  count.textContent = `${ticket.value.length} / 6000`;
  if (selected && ticket.value !== samples[selected].text) { selected = null; document.querySelectorAll('.scenario').forEach(node => node.classList.remove('selected')); }
  if (!editorDirty) return setEditor(buildRequest(ticket.value));
  const { payload } = readEditor();
  if (payload && payload.state && typeof payload.state === 'object' && !Array.isArray(payload.state) && typeof payload.state.ticket === 'string') {
    payload.state.ticket = ticket.value;
    requestJson.value = JSON.stringify(payload, null, 2);
    refreshEditor();
  } else if (payload && typeof payload.state === 'string') {
    payload.state = ticket.value;
    requestJson.value = JSON.stringify(payload, null, 2);
    refreshEditor();
  } else if (payload) {
    validation.textContent = 'The JSON state is custom. Edit the JSON to change the ticket sent to Jev.';
  }
});
requestJson.addEventListener('input', () => {
  editorDirty = true;
  refreshEditor();
  const { payload } = readEditor();
  const currentTicket = typeof payload?.state === 'string' ? payload.state : payload?.state?.ticket;
  if (typeof currentTicket === 'string' && currentTicket !== ticket.value) {
    ticket.value = currentTicket.slice(0, 6000);
    count.textContent = `${ticket.value.length} / 6000`;
    selected = null;
    document.querySelectorAll('.scenario').forEach(node => node.classList.remove('selected'));
  }
});
requestJson.addEventListener('scroll', () => { document.querySelector('#request-lines').scrollTop = requestJson.scrollTop; });
requestJson.addEventListener('keydown', event => {
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = requestJson.selectionStart;
    requestJson.setRangeText('  ', start, requestJson.selectionEnd, 'end');
    requestJson.dispatchEvent(new Event('input'));
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); runCurrentRequest(); }
});
document.querySelector('#reset-request').addEventListener('click', () => setEditor(buildRequest(ticket.value)));
selectSample('mfa');
async function updateStatus() {
  try {
    const status = await fetch('/api/status').then(response => response.json());
    const badge = document.querySelector('#connection-badge');
    badge.textContent = status.live ? '● LIVE API READY' : '○ PREVIEW MODE';
    badge.classList.toggle('live', status.live);
  } catch { document.querySelector('#connection-badge').textContent = '○ CONNECTION UNKNOWN'; }
}
updateStatus();
function renderAnswers(answers, mode, usage = null) {
  const route = answers.route || {};
  const urgency = answers.urgency || {};
  const human = answers.human_review || {};
  const level = Math.max(0, Math.min(3, Math.round(Number(urgency.score) || 0)));
  const topLevel = Number(Object.entries(urgency.probabilities || {}).sort((a,b)=>b[1]-a[1])[0]?.[0]);
  const routeValue = routeLabels[route.choice] || String(route.choice || 'Unknown').replaceAll('_', ' ');
  const reviewValue = Number(human.noul) >= .5 ? 'Review required' : 'Review signal low';
  empty.hidden = true;
  content.hidden = false;
  state.textContent = mode === 'live' ? 'LIVE RESULT' : 'ILLUSTRATIVE';
  state.className = `result-state ${mode}`;
  content.innerHTML = `
    <div class="result-banner"><div><strong>${mode === 'live' ? 'Jev analysis complete' : 'Illustrative result'}</strong><small>${mode === 'live' ? 'Live API response for this ticket' : 'Sample values for interface exploration; not a Jev response'}</small></div><span class="banner-badge">✳ ${mode === 'live' ? 'LIVE' : 'PREVIEW'}</span></div>
    <div class="signal"><div class="signal-head"><span class="signal-num">01</span><strong>Workstream</strong><small>CHOICE</small></div><div class="signal-result"><b>${esc(routeValue)}</b><span>${pct(route.probabilities?.[route.choice])} match</span></div><div class="track"><span style="width:${pct(route.probabilities?.[route.choice])}"></span></div><div class="signal-meta">Confidence ${pct(route.confidence)} · ${Object.entries(route.probabilities || {}).sort((a,b)=>b[1]-a[1]).slice(1,3).map(([key,value]) => `${esc(routeLabels[key] || key)} ${pct(value)}`).join(' · ')}</div></div>
    <div class="signal"><div class="signal-head"><span class="signal-num">02</span><strong>Urgency</strong><small>SCORE</small></div><div class="signal-result"><b>${urgencyLabels[level]}</b><span>${Number(urgency.score || 0).toFixed(2)} / 3</span></div><div class="track"><span style="width:${pct((Number(urgency.score) || 0)/3)}"></span></div><div class="signal-meta">Probability weighted score · confidence ${pct(urgency.confidence)} · top level ${esc(urgencyLabels[Number.isInteger(topLevel) ? topLevel : level])}</div></div>
    <div class="signal"><div class="signal-head"><span class="signal-num">03</span><strong>Human review</strong><small>NOUL</small></div><div class="signal-result"><b>${reviewValue}</b><span>${pct(human.noul)} yes</span></div><div class="track"><span style="width:${pct(human.noul)}"></span></div><div class="signal-meta">Probability that review is needed before an action. No separate confidence field.</div></div>
    <div class="result-bottom"><span>${mode === 'live' ? `${usage?.input_tokens ?? '—'} input tokens · ${usage?.output_tokens ?? '—'} output tokens` : 'Example values · no API call made'}</span>${mode === 'live' ? '<button id="copy-request" type="button">COPY REQUEST JSON ↗</button>' : ''}</div>`;
  if (mode === 'live') document.querySelector('#copy-request').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(lastPayload, null, 2));
    document.querySelector('#copy-request').textContent = 'COPIED ✓';
  });
}
function renderGenericAnswers(answers, usage = null) {
  empty.hidden = true;
  content.hidden = false;
  state.textContent = 'LIVE RESULT'; state.className = 'result-state live';
  const rows = Object.entries(answers).map(([name, answer], index) => {
    let value;
    let detail;
    if (answer.type === 'choice') {
      value = answer.choice;
      detail = `Confidence ${pct(answer.confidence)} · ${Object.entries(answer.probabilities || {}).sort((a,b)=>b[1]-a[1]).map(([key, probability]) => `${esc(key)} ${pct(probability)}`).join(' · ')}`;
    } else if (answer.type === 'score') {
      value = `Score ${Number(answer.score).toFixed(2)}`;
      detail = `Confidence ${pct(answer.confidence)} · ${Object.entries(answer.probabilities || {}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([key, probability]) => `${esc(answer.legend?.[key] || `Level ${key}`)} ${pct(probability)}`).join(' · ')}`;
    } else if (answer.type === 'noul') {
      value = `${pct(answer.noul)} yes`;
      detail = 'Noul returns a yes probability without a separate confidence field.';
    } else {
      value = 'Unknown answer type';
      detail = 'Inspect the raw response for this answer.';
    }
    return `<div class="signal"><div class="signal-head"><span class="signal-num">${String(index + 1).padStart(2, '0')}</span><strong>${esc(name.replaceAll('_', ' '))}</strong><small>${esc(answer.type)}</small></div><div class="signal-result"><b>${esc(value)}</b></div><div class="signal-meta">${detail}</div></div>`;
  }).join('');
  content.innerHTML = `<div class="result-banner"><div><strong>Jev analysis complete</strong><small>Results for your edited request</small></div><span class="banner-badge">✳ LIVE</span></div>${rows}<div class="result-bottom"><span>${usage?.input_tokens ?? '—'} input tokens · ${usage?.output_tokens ?? '—'} output tokens</span><button id="copy-request" type="button">COPY REQUEST JSON ↗</button></div>`;
  document.querySelector('#copy-request').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(lastPayload, null, 2));
    document.querySelector('#copy-request').textContent = 'COPIED ✓';
  });
}
function showError(message) {
  empty.hidden = true;
  content.hidden = false;
  state.textContent = 'ERROR'; state.className = 'result-state preview';
  content.innerHTML = `<div class="error-box">${esc(message)}</div>`;
}
function showRaw(value, kind, meta) {
  lastRaw = JSON.stringify(value, null, 2);
  responseBody.replaceChildren();
  const pre = document.createElement('pre');
  pre.textContent = lastRaw;
  responseBody.append(pre);
  responseBadge.textContent = kind === 'success' ? '200 OK' : kind === 'preview' ? 'EXAMPLE' : 'ERROR';
  responseBadge.className = `response-badge ${kind}`;
  document.querySelector('#response-meta').textContent = meta;
  document.querySelector('#copy-response').disabled = false;
}
document.querySelector('#preview-btn').addEventListener('click', () => {
  if (!selected || editorDirty) return showError('Choose a sample ticket to see its illustrative output. Run the current JSON for edited requests.');
  lastPayload = null;
  renderAnswers(samples[selected].preview, 'preview');
  showRaw({ note: 'Illustrative values. No API call was made.', answers: samples[selected].preview }, 'preview', 'Sample output · no API call');
});
async function runCurrentRequest() {
  const { payload, error } = readEditor();
  if (error) return showError(error);
  const buttons = [document.querySelector('#analyze-btn'), document.querySelector('#run-json')];
  buttons.forEach(button => { button.disabled = true; button.dataset.original = button.innerHTML; button.innerHTML = 'Running…'; });
  state.textContent = 'RUNNING'; state.className = 'result-state';
  responseBadge.textContent = 'RUNNING'; responseBadge.className = 'response-badge';
  document.querySelector('#response-meta').textContent = 'Sending current JSON body…';
  const started = performance.now();
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload }) });
    const data = await response.json();
    const elapsed = Math.round(performance.now() - started);
    if (!response.ok) {
      showRaw(data, 'error', `HTTP ${response.status} · ${elapsed} ms`);
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
    lastPayload = data.request;
    showRaw(data.result, 'success', `HTTP ${response.status} · ${elapsed} ms · ${data.result.model || payload.model}`);
    const standard = !editorDirty && data.result.answers.route && data.result.answers.urgency && data.result.answers.human_review;
    if (standard) renderAnswers(data.result.answers, 'live', data.result.usage);
    else renderGenericAnswers(data.result.answers, data.result.usage);
  } catch (error) {
    showError(error.message || 'Analysis failed.');
    if (responseBadge.textContent === 'RUNNING') showRaw({ error: error.message || 'Network error' }, 'error', `${Math.round(performance.now() - started)} ms · request failed`);
  } finally { buttons.forEach(button => { button.disabled = false; button.innerHTML = button.dataset.original; }); refreshEditor(); }
}
document.querySelector('#analyze-btn').addEventListener('click', runCurrentRequest);
document.querySelector('#run-json').addEventListener('click', runCurrentRequest);
document.querySelector('#copy-response').addEventListener('click', async () => {
  if (!lastRaw) return;
  await navigator.clipboard.writeText(lastRaw);
  document.querySelector('#copy-response').textContent = 'Copied';
  setTimeout(() => { document.querySelector('#copy-response').textContent = 'Copy response'; }, 1600);
});
document.querySelector('#copy-curl').addEventListener('click', async () => {
  const { payload, error } = readEditor();
  if (error) return showError(error);
  const body = JSON.stringify(payload, null, 2).replaceAll("'", "'\\''");
  const command = `curl -X POST https://thejevai.com/v1/systemone \\\n  -H "Authorization: Bearer $JEV_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
  await navigator.clipboard.writeText(command);
  document.querySelector('#copy-curl').textContent = 'Copied';
  setTimeout(() => { document.querySelector('#copy-curl').textContent = 'Copy cURL'; }, 1600);
});
