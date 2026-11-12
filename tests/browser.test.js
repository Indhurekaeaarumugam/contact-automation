process.env.LOG_SILENT = '1';
const test = require('node:test');
const assert = require('node:assert');

const { scoreLink, rankCandidates, fallbackUrls } = require('../src/browser/contactPageFinder');
const { evaluateSignals } = require('../src/browser/submissionVerifier');
const { classifyField, isConsentField, buildFieldValues, pickSelectOption } = require('../src/services/fieldMappingService');
const { normalizeUrl, isUrlAllowed } = require('../src/utils/urlPolicy');
const { describeError, isPendingStatus } = require('../src/utils/statusHandler');

// ---------- finding the Contact Us / Get a Quote page ----------

test('ranks Contact Us and Get a Quote links above ordinary links', () => {
  const links = [
    { text: 'Home', href: 'https://acme.com/' },
    { text: 'Blog', href: 'https://acme.com/blog' },
    { text: 'Get a Free Quote', href: 'https://acme.com/quote-request' },
    { text: 'Contact Us', href: 'https://acme.com/contact-us' },
    { text: 'Privacy Policy', href: 'https://acme.com/privacy-policy' },
    { text: 'Contact us on Twitter', href: 'https://twitter.com/acme' },
  ];
  const ranked = rankCandidates(links, 'https://acme.com/');
  assert.deepStrictEqual(ranked.map((r) => r.url), ['https://acme.com/contact-us', 'https://acme.com/quote-request']);
});

test('uses the href when the link text is an icon or empty, ignores other sites and non-http links', () => {
  const links = [
    { text: '', href: 'https://www.acme.com/contact' },
    { text: 'Email', href: 'mailto:hi@acme.com' },
    { text: 'Contact', href: 'https://other.com/contact' },
    { text: 'Contact', href: 'https://acme.com/contact#form' },
  ];
  const ranked = rankCandidates(links, 'https://acme.com');
  assert.strictEqual(ranked.length, 1);
  assert.match(ranked[0].url, /^https:\/\/(www\.)?acme\.com\/contact$/);
});

test('blog posts that merely mention a quote are not treated as the quote page', () => {
  assert.ok(scoreLink({ text: 'How to get a quote', href: 'https://acme.com/blog/how-to-get-a-quote' }) < 50);
  assert.ok(scoreLink({ text: 'Request a Quote', href: 'https://acme.com/request-a-quote' }) >= 90);
});

test('fallback URLs cover the common contact paths', () => {
  const urls = fallbackUrls('https://acme.com/some/page');
  assert.ok(urls.includes('https://acme.com/contact-us'));
  assert.ok(urls.includes('https://acme.com/get-a-quote'));
});

// ---------- mapping static details to form fields ----------

test('classifies typical contact-form fields', () => {
  assert.strictEqual(classifyField({ tag: 'input', type: 'email', name: 'x' }), 'email');
  assert.strictEqual(classifyField({ tag: 'input', type: 'tel', name: 'x' }), 'phone');
  assert.strictEqual(classifyField({ tag: 'textarea', type: 'textarea' }), 'message');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', label: 'Your Name *' }), 'name');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', placeholder: 'First Name' }), 'firstName');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', name: 'last_name' }), 'lastName');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', name: 'company_name' }), 'company');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', id: 'mobile_no' }), 'phone');
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', label: 'Subject' }), 'subject');
  assert.strictEqual(classifyField({ tag: 'input', type: 'password', name: 'pw' }), null);
  assert.strictEqual(classifyField({ tag: 'input', type: 'text', name: 'zzz' }), null);
});

test('recognises consent checkboxes and picks a sensible select option', () => {
  assert.strictEqual(isConsentField({ type: 'checkbox', label: 'I agree to the privacy policy' }), true);
  assert.strictEqual(isConsentField({ type: 'checkbox', label: 'Send me offers' }), false);
  const options = [{ value: '', text: 'Select one' }, { value: 'sales', text: 'Sales' }, { value: 'x', text: 'Support' }];
  assert.strictEqual(pickSelectOption(options, ''), 'sales');
  assert.strictEqual(pickSelectOption(options, 'support'), 'x');
  assert.strictEqual(pickSelectOption([{ value: '', text: 'Select' }], ''), null);
});

test('buildFieldValues splits the name and never leaves last name empty', () => {
  const v = buildFieldValues({ name: 'Indhu Reka', email: 'a@b.com' });
  assert.deepStrictEqual([v.firstName, v.lastName], ['Indhu', 'Reka']);
  assert.strictEqual(buildFieldValues({ name: 'Indhu' }).lastName, 'Indhu');
});

// ---------- deciding Success vs Failed after submit ----------

test('Success needs an explicit confirmation signal', () => {
  const base = { beforeUrl: 'https://acme.com/contact', beforeText: 'Contact us\nName\nEmail\nSend' };
  assert.strictEqual(
    evaluateSignals({ ...base, afterUrl: base.beforeUrl, afterText: 'Thank you! Your message has been sent.' }).success,
    true
  );
  assert.strictEqual(
    evaluateSignals({ ...base, afterUrl: 'https://acme.com/thank-you', afterText: 'Welcome' }).success,
    true
  );
  const nothing = evaluateSignals({ ...base, afterUrl: base.beforeUrl, afterText: base.beforeText });
  assert.strictEqual(nothing.success, false);
  assert.match(nothing.reason, /No confirmation/);
});

test('thank-you text that was already on the page before submit does not count', () => {
  const text = 'Thank you for visiting our site\nName\nEmail\nSend';
  const r = evaluateSignals({ beforeUrl: 'u', beforeText: text, afterUrl: 'u', afterText: text });
  assert.strictEqual(r.success, false);
});

test('validation errors that appear after submit are reported as the failure reason', () => {
  const r = evaluateSignals({
    beforeUrl: 'u',
    beforeText: 'Name\nEmail',
    afterUrl: 'u',
    afterText: 'Name\nEmail\nPlease enter a valid phone number',
  });
  assert.strictEqual(r.success, false);
  assert.match(r.reason, /Form error after submit/);
});

// ---------- URL handling and error wording ----------

test('normalizes sheet URLs and enforces the optional domain allow-list', () => {
  assert.strictEqual(normalizeUrl('acme.com'), 'https://acme.com/');
  assert.strictEqual(normalizeUrl('  http://acme.com/a '), 'http://acme.com/a');
  assert.strictEqual(normalizeUrl('not a url'), null);
  assert.strictEqual(normalizeUrl('javascript:alert(1)'), null);
  assert.strictEqual(normalizeUrl(''), null);
  assert.strictEqual(isUrlAllowed('https://shop.acme.com/x', ['acme.com']), true);
  assert.strictEqual(isUrlAllowed('https://evil.com', ['acme.com']), false);
  assert.strictEqual(isUrlAllowed('https://anything.com', []), true);
});

test('turns Playwright errors into readable reasons', () => {
  assert.strictEqual(describeError(new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://x')), 'Domain not found (DNS error)');
  assert.strictEqual(describeError(new Error('page.goto: Timeout 30000ms exceeded.')), 'Page load or action timed out');
  assert.strictEqual(describeError(new Error('net::ERR_CERT_DATE_INVALID')), 'SSL certificate error');
  assert.strictEqual(isPendingStatus(''), true);
  assert.strictEqual(isPendingStatus('Pending'), true);
  assert.strictEqual(isPendingStatus('Failed'), false);
});
