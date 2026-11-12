const { classifyField, isConsentField, buildFieldValues, pickSelectOption } = require('../services/fieldMappingService');
const claude = require('../services/claudeService');

// Runs inside the browser. Must be self-contained.
function describeFieldInPage(el) {
  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';

  let label = '';
  if (el.labels && el.labels.length) label = Array.from(el.labels).map((l) => l.innerText).join(' ');
  if (!label) {
    const wrap = el.closest('label');
    if (wrap) label = wrap.innerText;
  }
  if (!label && el.getAttribute('aria-labelledby')) {
    label = el
      .getAttribute('aria-labelledby')
      .split(/\s+/)
      .map((id) => {
        const n = document.getElementById(id);
        return n ? n.innerText : '';
      })
      .join(' ');
  }
  if (!label) {
    const prev = el.previousElementSibling;
    if (prev && prev.innerText && prev.innerText.length < 60) label = prev.innerText;
  }
  if (!label && el.parentElement) {
    const t = Array.from(el.parentElement.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join(' ')
      .trim();
    if (t && t.length < 60) label = t;
  }
  label = (label || '').replace(/\s+/g, ' ').trim();

  const tag = el.tagName.toLowerCase();
  return {
    tag,
    type: (el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase(),
    name: el.getAttribute('name') || '',
    id: el.id || '',
    placeholder: el.getAttribute('placeholder') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    autocomplete: el.getAttribute('autocomplete') || '',
    label,
    required: Boolean(el.required) || el.getAttribute('aria-required') === 'true' || /\*/.test(label),
    disabled: Boolean(el.disabled),
    readOnly: Boolean(el.readOnly),
    value: el.value || '',
    visible,
    options: tag === 'select' ? Array.from(el.options).map((o) => ({ value: o.value, text: (o.text || '').trim() })) : [],
  };
}

const SKIP_TYPES = ['hidden', 'submit', 'button', 'image', 'reset'];
const VALUE_KEYS = ['email', 'phone', 'firstName', 'lastName', 'company', 'subject', 'website', 'message', 'name'];

async function collectFields(formHandle) {
  const handles = await formHandle.$$('input, textarea, select');
  const fields = [];
  for (const handle of handles) {
    try {
      const desc = await handle.evaluate(describeFieldInPage);
      if (SKIP_TYPES.includes(desc.type) || !desc.visible || desc.disabled || desc.readOnly) continue; // hidden fields / honeypots are never touched
      fields.push({ handle, desc });
    } catch (_) {
      /* element vanished */
    }
  }
  return fields;
}

function labelOf(desc) {
  return desc.label || desc.placeholder || desc.name || desc.id || desc.type;
}

// Fills a detected form. `form` is the object returned by detectForm().
async function fillForm(form, contact) {
  const values = buildFieldValues(contact);
  const fields = await collectFields(form.handle);
  const filled = [];
  const unmappedRequired = [];
  const radioGroups = new Map();

  // First pass: rule-based mapping
  const pendingText = [];
  for (const field of fields) {
    const { handle, desc } = field;
    try {
      if (desc.type === 'checkbox') {
        if (isConsentField(desc) && desc.required) await handle.check({ timeout: 3000 });
        else if (desc.required) unmappedRequired.push(labelOf(desc));
        continue;
      }
      if (desc.type === 'radio') {
        if (desc.required && !radioGroups.has(desc.name)) radioGroups.set(desc.name, handle);
        continue;
      }
      if (desc.type === 'file') {
        if (desc.required) unmappedRequired.push(labelOf(desc));
        continue;
      }
      if (desc.tag === 'select') {
        if (desc.required || /subject|topic|service|enquiry|inquiry|reason/i.test(labelOf(desc) + desc.name)) {
          const value = pickSelectOption(desc.options, values.subject);
          if (value !== null) {
            await handle.selectOption(value, { timeout: 3000 });
            filled.push('select');
          } else if (desc.required) {
            unmappedRequired.push(labelOf(desc));
          }
        }
        continue;
      }
      if (desc.value && desc.value.trim()) continue; // already pre-filled by the site
      const key = classifyField(desc);
      if (key && values[key]) {
        await handle.fill(values[key], { timeout: 5000 });
        filled.push(key);
      } else if (desc.required) {
        pendingText.push(field);
      }
    } catch (_) {
      if (desc.required) unmappedRequired.push(labelOf(desc));
    }
  }

  // Optional second pass: ask Claude about required text fields the rules could not place
  if (pendingText.length > 0 && claude.isEnabled()) {
    const descriptors = pendingText.map((f, index) => ({
      index,
      tag: f.desc.tag,
      type: f.desc.type,
      name: f.desc.name,
      id: f.desc.id,
      placeholder: f.desc.placeholder,
      label: f.desc.label,
    }));
    const mapping = await claude.suggestMapping(descriptors, VALUE_KEYS);
    pendingText.forEach((f, index) => {
      const key = mapping[String(index)];
      f.aiKey = key && values[key] ? key : null;
    });
  }
  for (const field of pendingText) {
    if (field.aiKey) {
      try {
        await field.handle.fill(values[field.aiKey], { timeout: 5000 });
        filled.push(field.aiKey);
        continue;
      } catch (_) {
        /* fall through to unmapped */
      }
    }
    unmappedRequired.push(labelOf(field.desc));
  }

  // Required radio groups: choose the first option so validation does not block the submit
  for (const handle of radioGroups.values()) {
    try {
      await handle.check({ timeout: 3000 });
    } catch (_) {
      /* ignore */
    }
  }

  if (unmappedRequired.length > 0) {
    return { ok: false, filled, unmappedRequired, reason: `Required field not supported: ${unmappedRequired.slice(0, 3).join(', ')}` };
  }
  if (filled.length < 2) {
    return { ok: false, filled, unmappedRequired, reason: 'Form fields not recognised (fewer than 2 fields could be filled)' };
  }
  return { ok: true, filled, unmappedRequired };
}

// Clicks the submit button; falls back to form.requestSubmit() if the click is blocked.
async function submitForm(formHandle) {
  const button =
    (await formHandle.$('button[type="submit"], input[type="submit"], input[type="image"]')) ||
    (await formHandle.$('button:not([type="button"]):not([type="reset"])')) ||
    (await formHandle.$('[role="button"], a.button, a.btn'));
  if (button) {
    try {
      await button.scrollIntoViewIfNeeded({ timeout: 3000 });
      await button.click({ timeout: 8000 });
      return 'click';
    } catch (_) {
      /* overlay or detached - use requestSubmit below */
    }
  }
  await formHandle.evaluate((f) => {
    if (typeof f.requestSubmit === 'function') f.requestSubmit();
    else f.submit();
  });
  return 'requestSubmit';
}

module.exports = { fillForm, submitForm };
