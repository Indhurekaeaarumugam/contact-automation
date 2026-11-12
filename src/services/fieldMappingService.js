// Pure logic: decide which of our static details belongs in which form field.

// Order matters: more specific rules come first ("company name" must not become "name").
const RULES = [
  ['email', /e-?mail/],
  ['phone', /phone|mobile|\btel\b|telephone|contact\s*(no|number)|whats?app/],
  ['firstName', /first[\s_-]*name|fname|given[\s_-]*name|forename/],
  ['lastName', /last[\s_-]*name|lname|surname|family[\s_-]*name/],
  ['company', /company|organi[sz]ation|business|firm|employer/],
  ['subject', /subject|topic|regarding|reason\s+for/],
  ['website', /website|web[\s_-]*site|\burl\b|web\s*address/],
  ['message', /message|comment|enquiry|inquiry|details|how can we help|requirement|description|tell us|your\s+needs/],
  ['name', /name/],
];

const CONSENT = /agree|consent|terms|privacy|accept|gdpr|policy|permission/i;

function fieldText(d) {
  return [d.name, d.id, d.placeholder, d.label, d.ariaLabel, d.autocomplete].join(' ').toLowerCase();
}

// d: { tag, type, name, id, placeholder, label, ariaLabel, autocomplete }
// returns one of: email, phone, firstName, lastName, company, subject, website, message, name, or null
function classifyField(d) {
  const type = String(d.type || '').toLowerCase();
  if (['checkbox', 'radio', 'file', 'password', 'hidden', 'submit', 'button', 'image', 'reset', 'range', 'color'].includes(type)) {
    return null;
  }
  if (d.tag === 'select') return null;
  if (type === 'email') return 'email';
  if (type === 'tel') return 'phone';
  if (d.tag === 'textarea' || type === 'textarea') return 'message';
  if (type === 'url') return 'website';
  if (type === 'number' || type === 'date' || type === 'time' || type === 'datetime-local' || type === 'month' || type === 'week') {
    return null;
  }
  const hay = fieldText(d);
  for (const [key, re] of RULES) {
    if (re.test(hay)) return key;
  }
  return null;
}

function isConsentField(d) {
  return String(d.type).toLowerCase() === 'checkbox' && CONSENT.test(fieldText(d));
}

// Expands the configured contact details into every key the classifier can return.
function buildFieldValues(contact) {
  const parts = String(contact.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = contact.firstName || parts[0] || '';
  const lastName = contact.lastName || parts.slice(1).join(' ') || firstName;
  return {
    name: contact.name || '',
    firstName,
    lastName,
    email: contact.email || '',
    phone: contact.phone || '',
    company: contact.company || '',
    website: contact.website || '',
    subject: contact.subject || '',
    message: contact.message || '',
  };
}

// options: [{ value, text }] -> the value to select, or null if nothing sensible.
function pickSelectOption(options, subject) {
  const usable = (options || []).filter(
    (o) => o.value !== '' && !/^(select|choose|please|--|—|pick)/i.test(String(o.text).trim())
  );
  if (usable.length === 0) return null;
  const wanted = String(subject || '').toLowerCase();
  const exact = wanted && usable.find((o) => String(o.text).toLowerCase().includes(wanted));
  const general = usable.find((o) => /general|enquiry|inquiry|quote|sales|contact|other/i.test(o.text));
  return (exact || general || usable[0]).value;
}

module.exports = { classifyField, isConsentField, buildFieldValues, pickSelectOption, RULES };
