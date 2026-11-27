// Tests voor prioriteit en notities op het feedbackbord van /toposadmin.
// Draaien met: node --test test/feedback-notities.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { valideerFeedback, valideerPrioriteit, valideerNotitie } = require('../api/_topos/feedback.js');
const { maakSessie } = require('../api/_topos/sessie.js');
const { maakHandler } = require('../api/toposadmin.js');

const GEHEIM = 'test-sessiegeheim';
const ENV = { TOPOS_TOEGANGSCODE: 'geheim-code', TOPOS_WEBHOOK_SECRET: 'webhook-geheim', TOPOS_SESSIE_SECRET: GEHEIM };
const NU = 1_700_000_000_000;
const melding = () => ({ actie: 'feedback_nieuw', klant: 'kleidi', artikel: 'Een artikel', feedback: 'De titel klopt niet', uitleg: 'Het gaat over de laadtijd van de hele site.' });
const prio = () => ({ actie: 'feedback_prioriteit', klant: 'optinsight', id: 'FB-20261125-4', prioriteit: 'Hoog' });
const notitie = () => ({ actie: 'feedback_notitie', klant: 'optinsight', id: 'FB-20261125-4', van: 'Tes', notitie: 'Nog een voorbeeld erbij.' });

test('prioriteit bij een nieuwe melding is optioneel en kent drie waarden', () => {
  assert.strictEqual(valideerFeedback(melding()).ok, true);
  for (const p of ['Hoog', 'Midden', 'Laag']) assert.strictEqual(valideerFeedback({ ...melding(), prioriteit: p }).ok, true, p);
  for (const p of ['Urgent', 'hoog', 3, '']) assert.strictEqual(valideerFeedback({ ...melding(), prioriteit: p }).ok, false, String(p));
});
test('prioriteit wijzigen vraagt klant, nummer en een geldige waarde', () => {
  assert.deepStrictEqual(valideerPrioriteit(prio()), { ok: true });
  for (const x of [{ klant: 'sila' }, { id: 'rommel' }, { id: undefined }, { prioriteit: 'Urgent' }, { prioriteit: undefined }]) assert.strictEqual(valideerPrioriteit({ ...prio(), ...x }).ok, false, JSON.stringify(x));
  assert.strictEqual(valideerPrioriteit(null).ok, false);
});
test('notitie vraagt klant, nummer, naam en tekst', () => {
  assert.deepStrictEqual(valideerNotitie(notitie()), { ok: true });
  assert.strictEqual(valideerNotitie({ ...notitie(), van: 'Jamal' }).ok, true);
  for (const x of [{ klant: 'sila' }, { id: 'FB-1' }, { van: 'Martijn' }, { van: undefined }, { notitie: ' ' }, { notitie: 'x'.repeat(5001) }, { notitie: 5 }]) assert.strictEqual(valideerNotitie({ ...notitie(), ...x }).ok, false, JSON.stringify(x).slice(0, 60));
  assert.strictEqual(valideerNotitie([]).ok, false);
});
test('notitie mag een schermafbeelding hebben, met dezelfde regels als bij een melding', () => {
  const s = { naam: 'a.png', mime: 'image/png', inhoudBase64: 'AAAA' };
  assert.strictEqual(valideerNotitie({ ...notitie(), screenshot: s }).ok, true);
  assert.strictEqual(valideerNotitie({ ...notitie(), screenshot: { ...s, mime: 'image/gif' } }).ok, false);
  assert.strictEqual(valideerNotitie({ ...notitie(), screenshot: { ...s, inhoudBase64: '' } }).ok, false);
});

function nepFetch(antwoorden) {
  const calls = [];
  const f = async (url, opts) => { const body = JSON.parse(opts.body); calls.push({ body, signal: opts.signal }); return { ok: true, status: 200, json: async () => antwoorden[body.actie] || { ok: true } }; };
  f.calls = calls;
  return f;
}
async function roep(handler, body, metCookie = true) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(t) { this.tekst = t; } };
  await handler({ method: 'POST', headers: metCookie ? { cookie: 'topos_sessie=' + maakSessie(GEHEIM, NU) } : {}, body }, res);
  return { status: res.statusCode, data: JSON.parse(res.tekst) };
}
const maak = (fetch) => maakHandler({ fetch, env: ENV, nu: () => NU });

test('handler: prioriteit en notitie zonder cookie geven 401', async () => {
  for (const b of [prio(), notitie()]) {
    const f = nepFetch({}); const r = await roep(maak(f), b, false);
    assert.strictEqual(r.status, 401); assert.strictEqual(f.calls.length, 0);
  }
});
test('handler: alleen de toegestane velden gaan naar n8n', async () => {
  const f = nepFetch({}); const h = maak(f);
  assert.strictEqual((await roep(h, { ...prio(), status: 'Verwerkt', extra: 1 })).status, 200);
  assert.deepStrictEqual(Object.keys(f.calls[0].body).sort(), ['actie', 'id', 'klant', 'prioriteit']);
  assert.strictEqual((await roep(h, { ...notitie(), status: 'Verwerkt' })).status, 200);
  assert.deepStrictEqual(Object.keys(f.calls[1].body).sort(), ['actie', 'id', 'klant', 'notitie', 'van']);
  await roep(h, { ...melding(), prioriteit: 'Laag' });
  assert.strictEqual(f.calls[2].body.prioriteit, 'Laag');
});
test('handler: ongeldige invoer geeft 400 en een afwijzing van n8n ook', async () => {
  const f = nepFetch({ feedback_notitie: { ok: false, fout: 'ongeldig', bericht: 'Deze melding bestaat niet.' } });
  const h = maak(f);
  assert.strictEqual((await roep(h, { ...prio(), prioriteit: 'x' })).status, 400);
  assert.strictEqual((await roep(h, { ...notitie(), notitie: '' })).status, 400);
  assert.strictEqual(f.calls.length, 0);
  const r = await roep(h, notitie());
  assert.strictEqual(r.status, 400); assert.match(r.data.bericht, /bestaat niet/);
});
test('vercel geeft de serverfunctie langer dan de wachttijd op n8n', () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(v.functions['api/toposadmin.js'].maxDuration >= 30);
});

const html = fs.readFileSync(path.join(__dirname, '..', 'toposadmin.html'), 'utf8');
const blok = html.slice(html.indexOf('// BEGIN-LOGICA'), html.indexOf('// EINDE-LOGICA'));
const pagina = new Function(`${blok}; return { prioriteitVan, filterFeedback };`)();
test('pagina: sorteert op prioriteit, daarna nieuwste eerst; leeg geldt als midden', () => {
  assert.strictEqual(pagina.prioriteitVan({}), 'Midden');
  assert.strictEqual(pagina.prioriteitVan({ prioriteit: ' hoog ' }), 'Hoog');
  assert.strictEqual(pagina.prioriteitVan({ prioriteit: 'iets' }), 'Midden');
  const rijen = [{ id: 'FB-20261125-1', prioriteit: 'Laag' }, { id: 'FB-20261125-2' }, { id: 'FB-20261125-10', prioriteit: 'Midden' }, { id: 'FB-20261101-1', prioriteit: 'Hoog' }];
  assert.deepStrictEqual(pagina.filterFeedback(rijen, 'open').map((r) => r.id), ['FB-20261101-1', 'FB-20261125-10', 'FB-20261125-2', 'FB-20261125-1']);
});
