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

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInstruction = value => typeof value === 'string' || isObject(value) || Array.isArray(value);
export function validatePayload(payload) {
  if (!isObject(payload)) return 'The request must be a JSON object.';
  if (typeof payload.model !== 'string' || !payload.model.trim() || payload.model.length > 100) return 'Set a valid model name.';
  const state = payload.state;
  if (!(typeof state === 'string' || isObject(state) || (Array.isArray(state) && state.every(item => typeof item === 'string')))) return 'State must be text, an object, or an array of text.';
  if (JSON.stringify(state).length > 10000) return 'State is too long for this demo.';
  if (!isObject(payload.questions) || Object.keys(payload.questions).length < 1 || Object.keys(payload.questions).length > 8) return 'Add between one and eight questions.';
  for (const [name, question] of Object.entries(payload.questions)) {
    if (!/^[a-z][a-z0-9_]{0,49}$/i.test(name) || !isObject(question) || !isInstruction(question.instructions)) return `Check the question named ${name}.`;
    if (question.type === 'choice') {
      if (!isObject(question.criteria) || Object.keys(question.criteria).length < 2 || Object.keys(question.criteria).length > 255) return `${name}: Choice needs at least two options.`;
    } else if (question.type === 'score') {
      if (!Array.isArray(question.criteria) || question.criteria.length < 2 || question.criteria.length > 10) return `${name}: Score needs two to ten ordered levels.`;
    } else if (question.type === 'noul') {
      if (question.criteria !== undefined && !isObject(question.criteria)) return `${name}: Noul criteria must be an object.`;
    } else return `${name}: type must be choice, score, or noul.`;
  }
  return null;
}
