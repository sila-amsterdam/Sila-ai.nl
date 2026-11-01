// Tests voor het feedbackbord op /toposadmin: validatie en doorsturen door de serverfunctie.
// Draaien met: node --test test/feedback.test.js
const test = require('node:test');
const assert = require('node:assert');
const { valideerFeedback, MAX_SCREENSHOT_BYTES } = require('../api/_topos/feedback.js');
const { maakSessie } = require('../api/_topos/sessie.js');
const { maakHandler } = require('../api/toposadmin.js');

const GEHEIM = 'test-sessiegeheim';
const ENV = { TOPOS_TOEGANGSCODE: 'geheim-code', TOPOS_WEBHOOK_SECRET: 'webhook-geheim', TOPOS_SESSIE_SECRET: GEHEIM };
const NU = 1_700_000_000_000;

const basis = () => ({
  actie: 'feedback_nieuw',
  klant: 'kleidi',
  artikel: 'Webhosting kiezen voor een snelle website',
  feedback: 'De titel klopt niet helemaal',
  uitleg: 'In de titel staat snelle WordPress, maar het gaat over een snelle laadtijd van de hele website.',
  link: 'https://docs.google.com/document/d/abc/edit'
});

// ---------- validatie ----------
test('feedback: een complete melding is geldig', () => {
  assert.deepStrictEqual(valideerFeedback(basis()), { ok: true });
});
test('feedback: link, artikellink en screenshot zijn optioneel', () => {
  const b = basis(); delete b.link;
  assert.strictEqual(valideerFeedback(b).ok, true);
  assert.strictEqual(valideerFeedback({ ...b, link: '', artikelLink: '' }).ok, true);
  assert.strictEqual(valideerFeedback({ ...b, artikelLink: 'https://docs.google.com/document/d/abc/edit' }).ok, true);
});
test('feedback: het artikel is verplicht, zodat altijd duidelijk is waarover het gaat', () => {
  const b = basis(); delete b.artikel;
  assert.strictEqual(valideerFeedback(b).ok, false);
  assert.match(valideerFeedback(b).fout, /artikel/i);
  assert.strictEqual(valideerFeedback({ ...basis(), artikel: '   ' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), artikel: 'Algemeen, geen specifiek artikel' }).ok, true);
});
test('feedback: de artikellink moet een http(s)-adres zijn', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), artikelLink: 'javascript:alert(1)' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), artikelLink: 'niet-een-url' }).ok, false);
});
test('feedback: klant moet kleidi of optinsight zijn', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), klant: 'sila' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), klant: undefined }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), klant: 'optinsight' }).ok, true);
});
test('feedback: de korte regel is verplicht en maximaal 200 tekens', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), feedback: '   ' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), feedback: 'abc' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), feedback: 'x'.repeat(201) }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), feedback: 'x'.repeat(200) }).ok, true);
});
test('feedback: de uitleg is verplicht en maximaal 5000 tekens', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), uitleg: '' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), uitleg: 'kort' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), uitleg: 'x'.repeat(5001) }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), uitleg: 'x'.repeat(5000) }).ok, true);
});
test('feedback: artikel maximaal 300 tekens en moet tekst zijn', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), artikel: 'x'.repeat(301) }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), artikel: 42 }).ok, false);
});
test('feedback: link moet een http(s)-adres zijn', () => {
  assert.strictEqual(valideerFeedback({ ...basis(), link: 'niet-een-url' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), link: 'javascript:alert(1)' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), link: 'ftp://x.nl' }).ok, false);
  assert.strictEqual(valideerFeedback({ ...basis(), link: 'https://example.com/a?b=1' }).ok, true);
});
test('feedback: screenshot alleen png of jpg, niet leeg en niet te groot', () => {
  const shot = (o) => ({ ...basis(), screenshot: { naam: 'scherm.png', mime: 'image/png', inhoudBase64: 'AAAA', ...o } });
  assert.strictEqual(valideerFeedback(shot({})).ok, true);
  assert.strictEqual(valideerFeedback(shot({ mime: 'image/gif' })).ok, false);
  assert.strictEqual(valideerFeedback(shot({ mime: 'application/pdf', naam: 'a.pdf' })).ok, false);
  assert.strictEqual(valideerFeedback(shot({ inhoudBase64: '' })).ok, false);
  assert.strictEqual(valideerFeedback(shot({ inhoudBase64: '%%%%' })).ok, false);
  const groot = 'A'.repeat(Math.ceil((MAX_SCREENSHOT_BYTES + 100) / 3) * 4);
  assert.strictEqual(valideerFeedback(shot({ inhoudBase64: groot })).ok, false);
});
test('feedback: rommel als body wordt afgewezen', () => {
  for (const b of [null, undefined, 'tekst', 5, [], []]) assert.strictEqual(valideerFeedback(b).ok, false);
});

// ---------- serverfunctie ----------
function nepFetch(antwoorden) {
  const calls = [];
  const f = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, headers: opts.headers, body });
    const a = antwoorden[body.actie];
    const res = typeof a === 'function' ? a(body) : (a || {});
    return { ok: true, status: 200, json: async () => res };
  };
  f.calls = calls;
  return f;
}
async function roep(handler, { body, cookie, methode = 'POST' }) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { this.tekst = t; } };
  const req = { method: methode, headers: cookie ? { cookie } : {}, body };
  await handler(req, res);
  return { status: res.statusCode, data: res.tekst ? JSON.parse(res.tekst) : null };
}
const cookie = () => 'topos_sessie=' + maakSessie(GEHEIM, NU);

test('handler: feedback-acties zonder cookie geven 401 en roepen n8n niet aan', async () => {
  for (const actie of ['feedback_nieuw', 'feedback_lijst', 'feedback_artikelen']) {
    const fetch = nepFetch({});
    const h = maakHandler({ fetch, env: ENV, nu: () => NU });
    const r = await roep(h, { body: { ...basis(), actie, klant: 'kleidi' } });
    assert.strictEqual(r.status, 401, actie);
    assert.strictEqual(fetch.calls.length, 0, actie);
  }
});
test('handler: ongeldige feedback geeft 400 en gaat niet naar n8n', async () => {
  const fetch = nepFetch({});
  const h = maakHandler({ fetch, env: ENV, nu: () => NU });
  const r = await roep(h, { body: { ...basis(), uitleg: '' }, cookie: cookie() });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.ok, false);
  assert.strictEqual(fetch.calls.length, 0);
});
test('handler: geldige feedback gaat met geheim naar n8n, alleen de toegestane velden', async () => {
  const fetch = nepFetch({ feedback_nieuw: { ok: true, id: 'FB-20261101-1' } });
  const h = maakHandler({ fetch, env: ENV, nu: () => NU });
  const r = await roep(h, { body: { ...basis(), status: 'Verwerkt', reactie: 'hack', extra: 'x' }, cookie: cookie() });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data, { ok: true, id: 'FB-20261101-1' });
  assert.strictEqual(fetch.calls.length, 1);
  assert.strictEqual(fetch.calls[0].headers['X-Topos-Secret'], 'webhook-geheim');
  const b = fetch.calls[0].body;
  assert.strictEqual(b.actie, 'feedback_nieuw');
  assert.deepStrictEqual(Object.keys(b).sort(), ['actie', 'artikel', 'feedback', 'klant', 'link', 'uitleg']);
  const mLink = await roep(h, { body: { ...basis(), artikelLink: 'https://docs.google.com/document/d/abc/edit' }, cookie: cookie() });
  assert.strictEqual(mLink.status, 200);
  assert.strictEqual(fetch.calls[1].body.artikelLink, 'https://docs.google.com/document/d/abc/edit');
});
test('handler: feedback_lijst en feedback_artikelen worden doorgestuurd', async () => {
  const fetch = nepFetch({ feedback_lijst: { feedback: [] }, feedback_artikelen: { artikelen: [{ titel: 'A' }] } });
  const h = maakHandler({ fetch, env: ENV, nu: () => NU });
  const l = await roep(h, { body: { actie: 'feedback_lijst', extra: 1 }, cookie: cookie() });
  assert.deepStrictEqual(l.data, { feedback: [] });
  assert.deepStrictEqual(fetch.calls[0].body, { actie: 'feedback_lijst' });
  const a = await roep(h, { body: { actie: 'feedback_artikelen', klant: 'optinsight', extra: 1 }, cookie: cookie() });
  assert.deepStrictEqual(a.data, { artikelen: [{ titel: 'A' }] });
  assert.deepStrictEqual(fetch.calls[1].body, { actie: 'feedback_artikelen', klant: 'optinsight' });
});
test('handler: feedback_artikelen vraagt een bekende klant', async () => {
  const fetch = nepFetch({});
  const h = maakHandler({ fetch, env: ENV, nu: () => NU });
  const r = await roep(h, { body: { actie: 'feedback_artikelen', klant: 'sila' }, cookie: cookie() });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(fetch.calls.length, 0);
});
test('handler: als n8n niet antwoordt geeft de pagina een nette 502', async () => {
  const h = maakHandler({ fetch: async () => { throw new Error('weg'); }, env: ENV, nu: () => NU });
  const r = await roep(h, { body: basis(), cookie: cookie() });
  assert.strictEqual(r.status, 502);
  assert.strictEqual(r.data.fout, 'bron');
});

// ---------- geen oude route meer ----------
test('de oude naam customarticle bestaat niet meer: geen bestand, geen route', () => {
  const fs0 = require('node:fs'), path0 = require('node:path');
  assert.strictEqual(fs0.existsSync(path0.join(__dirname, '..', 'api', 'customarticle.js')), false);
  assert.strictEqual(fs0.existsSync(path0.join(__dirname, '..', 'customarticle.html')), false);
  const v = JSON.parse(fs0.readFileSync(path0.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(!JSON.stringify(v).includes('customarticle'));
  assert.deepStrictEqual(v.rewrites.map((r) => r.source), ['/toposadmin']);
});

// ---------- zuivere functies van de pagina (BEGIN-LOGICA in toposadmin.html) ----------
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'toposadmin.html'), 'utf8');
const blok = html.slice(html.indexOf('// BEGIN-LOGICA'), html.indexOf('// EINDE-LOGICA'));
const pagina = new Function(`${blok}; return { feedbackStatus, filterFeedback, aantalOpen };`)();

test('pagina: feedbackstatus kent drie statussen en valt terug op nieuw', () => {
  assert.deepStrictEqual(pagina.feedbackStatus('Nieuw'), ['nieuw', 'Nieuw']);
  assert.deepStrictEqual(pagina.feedbackStatus('In behandeling'), ['behandeling', 'In behandeling']);
  assert.deepStrictEqual(pagina.feedbackStatus(' verwerkt '), ['klaar', 'Verwerkt']);
  for (const x of ['', undefined, null, 'iets anders', 7]) assert.deepStrictEqual(pagina.feedbackStatus(x), ['nieuw', 'Nieuw']);
});
test('pagina: filter open toont nieuw en in behandeling, nieuwste eerst', () => {
  const rijen = [
    { id: 'FB-20261101-1', status: 'Verwerkt' }, { id: 'FB-20261101-2', status: 'Nieuw' },
    { id: 'FB-20261102-1', status: 'In behandeling' }, { id: 'FB-20261101-10', status: '' }, null, 'rommel'
  ];
  assert.deepStrictEqual(pagina.filterFeedback(rijen, 'open').map((r) => r.id), ['FB-20261102-1', 'FB-20261101-10', 'FB-20261101-2']);
  assert.deepStrictEqual(pagina.filterFeedback(rijen, 'verwerkt').map((r) => r.id), ['FB-20261101-1']);
  assert.strictEqual(pagina.filterFeedback(rijen, 'alles').length, 4);
  assert.strictEqual(pagina.aantalOpen(rijen), 3);
  assert.deepStrictEqual(pagina.filterFeedback(undefined, 'open'), []);
});
test('pagina: de tabs en de route /toposadmin staan erin', () => {
  assert.ok(html.includes("const PAD = '/toposadmin'"));
  assert.ok(html.includes('id="tab-feedback"') && html.includes('id="paneel-feedback"'));
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const bronnen = vercel.rewrites.map((r) => r.source);
  assert.ok(bronnen.includes('/toposadmin'));
});
