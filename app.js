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
let selected = 'mfa';
let lastPayload = null;
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
function selectSample(name) {
  selected = name;
  ticket.value = samples[name].text;
  count.textContent = `${ticket.value.length} / 6000`;
  document.querySelectorAll('.scenario').forEach(node => node.classList.toggle('selected', node.dataset.sample === name));
}
document.querySelectorAll('.scenario').forEach(node => node.addEventListener('click', () => selectSample(node.dataset.sample)));
ticket.addEventListener('input', () => {
  count.textContent = `${ticket.value.length} / 6000`;
  if (selected && ticket.value !== samples[selected].text) { selected = null; document.querySelectorAll('.scenario').forEach(node => node.classList.remove('selected')); }
});
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
function showError(message) {
  empty.hidden = true;
  content.hidden = false;
  state.textContent = 'ERROR'; state.className = 'result-state preview';
  content.innerHTML = `<div class="error-box">${esc(message)}</div>`;
}
document.querySelector('#preview-btn').addEventListener('click', () => {
  if (!selected) return showError('Choose a sample ticket to see its illustrative output. Use Analyze ticket for your own text.');
  lastPayload = null;
  renderAnswers(samples[selected].preview, 'preview');
});
document.querySelector('#analyze-btn').addEventListener('click', async () => {
  const message = ticket.value.trim();
  if (message.length < 8) return showError('Enter a ticket with at least 8 characters.');
  const button = document.querySelector('#analyze-btn');
  button.disabled = true; button.innerHTML = 'Analyzing…';
  state.textContent = 'RUNNING'; state.className = 'result-state';
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    lastPayload = data.request;
    renderAnswers(data.result.answers, 'live', data.result.usage);
  } catch (error) { showError(error.message || 'Analysis failed.'); }
  finally { button.disabled = false; button.innerHTML = 'Analyze ticket <span>↗</span>'; }
});
