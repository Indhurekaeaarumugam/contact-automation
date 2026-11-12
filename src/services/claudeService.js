// OPTIONAL. Only used when ENABLE_CLAUDE=true and ANTHROPIC_API_KEY is set.
// Asks Claude to map form fields the rule-based classifier could not recognise.
// Only field metadata (name/id/label/placeholder) is sent - never your contact details.
const env = require('../config/env');
const logger = require('../utils/logger');

function isEnabled() {
  return env.claude.enabled && Boolean(env.claude.apiKey);
}

// descriptors: [{ index, tag, type, name, id, placeholder, label }]
// returns { [index]: key } for the allowed keys only
async function suggestMapping(descriptors, allowedKeys) {
  if (!isEnabled() || descriptors.length === 0) return {};
  try {
    const sdk = require('@anthropic-ai/sdk');
    const Anthropic = sdk.default || sdk;
    const client = new Anthropic({ apiKey: env.claude.apiKey });
    const prompt =
      'You map web contact-form fields to a fixed set of keys.\n' +
      `Allowed keys: ${allowedKeys.join(', ')}.\n` +
      'For each field below choose the best key, or null if none fits.\n' +
      'Reply with ONLY a JSON object like {"0":"email","1":null}. No prose.\n\n' +
      JSON.stringify(descriptors);
    const msg = await client.messages.create({
      model: env.claude.model,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const out = {};
    for (const [idx, key] of Object.entries(parsed)) {
      if (key && allowedKeys.includes(key)) out[idx] = key;
    }
    return out;
  } catch (err) {
    logger.warn(`Claude field mapping skipped: ${err.message}`);
    return {};
  }
}

module.exports = { isEnabled, suggestMapping };
