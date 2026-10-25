// Tests voor Topos: serverfunctie voor /customarticle. Draaien met: node --test test/topos.test.js
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { maakSessie, controleerSessie } = require('../api/_topos/sessie.js');
const { valideerAanvraag, MAX_UPLOAD_BYTES } = require('../api/_topos/valideer.js');
const { maakHandler } = require('../api/customarticle.js');

const GEHEIM = 'test-sessiegeheim';
const UUR = 3600 * 1000;

// ---------- sessie ----------
test('sessie: vers token is geldig', () => {
  const nu = 1_000_000_000_000;
  assert.strictEqual(controleerSessie(maakSessie(GEHEIM, nu), GEHEIM, nu + 1000), true);
});
test('sessie: na 12 uur ongeldig, net ervoor nog geldig', () => {
  const nu = 1_000_000_000_000;
  const t = maakSessie(GEHEIM, nu);
  assert.strictEqual(controleerSessie(t, GEHEIM, nu + 12 * UUR - 1), true);
  assert.strictEqual(controleerSessie(t, GEHEIM, nu + 12 * UUR + 1), false);
});
test('sessie: gewijzigde handtekening of verlengde looptijd is ongeldig', () => {
  const nu = 1_000_000_000_000;
  const [exp, sig] = maakSessie(GEHEIM, nu).split('.');
  assert.strictEqual(controleerSessie(`${exp}.${sig.slice(0, -1)}${sig.slice(-1) === 'a' ? 'b' : 'a'}`, GEHEIM, nu), false);
  assert.strictEqual(controleerSessie(`${Number(exp) + 99 * UUR}.${sig}`, GEHEIM, nu), false);
  assert.strictEqual(controleerSessie(maakSessie(GEHEIM, nu), 'ander-geheim', nu), false);
});
test('sessie: undefined, leeg of rommel is ongeldig', () => {
  for (const t of [undefined, null, '', 'abc', '.', '123.', 12345, {}]) {
    assert.strictEqual(controleerSessie(t, GEHEIM, 1), false);
  }
  assert.strictEqual(controleerSessie('x', undefined, 1), false);
});

// ---------- validatie ----------
const basis = () => ({
  klant: 'kleidi',
  onderwerp: 'Rad van fortuin op je site',
  punten: 'Korte punten',
  bronnen: [{ type: 'link', waarde: 'https://example.com/a' }],
  insteek: 'Informatief',
  metAfbeeldingen: true
});
const b64 = (bytes) => Buffer.alloc(bytes, 65).toString('base64');

test('valideer: geldige aanvraag is ok', () => {
  assert.deepStrictEqual(valideerAanvraag(basis()), { ok: true });
});
test('valideer: onderwerp van 4 tekens wordt geweigerd, 5 mag', () => {
  const a = basis(); a.onderwerp = 'abcd';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  assert.ok(valideerAanvraag(a).fout);
  a.onderwerp = 'abcde';
  assert.strictEqual(valideerAanvraag(a).ok, true);
});
test('valideer: klant optinsight wordt hier niet geweigerd (dat doet n8n), onbekende klant wel', () => {
  const a = basis(); a.klant = 'optinsight';
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.klant = 'iemand-anders';
  assert.strictEqual(valideerAanvraag(a).ok, false);
});
test('valideer: bestanden samen boven 3 MB worden geweigerd', () => {
  const a = basis();
  const helft = Math.floor(MAX_UPLOAD_BYTES / 2) + 10;
  a.bronnen = [
    { type: 'bestand', naam: 'a.pdf', inhoudBase64: b64(helft) },
    { type: 'bestand', naam: 'b.txt', inhoudBase64: b64(helft) }
  ];
  const r = valideerAanvraag(a);
  assert.strictEqual(r.ok, false);
  assert.match(r.fout, /3 MB/);
});
test('valideer: afbeeldingen tellen mee in de 3 MB', () => {
  const a = basis();
  a.bronnen = [
    { type: 'bestand', naam: 'a.pdf', inhoudBase64: b64(MAX_UPLOAD_BYTES - 100) },
    { type: 'afbeelding', naam: 'a.png', mime: 'image/png', inhoudBase64: b64(500) }
  ];
  assert.strictEqual(valideerAanvraag(a).ok, false);
});
test('valideer: bestandstypen buiten pdf, txt, md worden geweigerd', () => {
  const a = basis();
  for (const naam of ['a.docx', 'a.exe', 'a', 'a.pdf.js']) {
    a.bronnen = [{ type: 'bestand', naam, inhoudBase64: b64(100) }];
    assert.strictEqual(valideerAanvraag(a).ok, false, naam);
  }
  for (const naam of ['a.pdf', 'b.TXT', 'c.md']) {
    a.bronnen = [{ type: 'bestand', naam, inhoudBase64: b64(100) }];
    assert.strictEqual(valideerAanvraag(a).ok, true, naam);
  }
});
test('valideer: afbeelding alleen png of jpeg', () => {
  const a = basis();
  a.bronnen = [{ type: 'afbeelding', naam: 'a.gif', mime: 'image/gif', inhoudBase64: b64(100) }];
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.bronnen = [{ type: 'afbeelding', naam: 'a.jpg', mime: 'image/jpeg', inhoudBase64: b64(100) }];
  assert.strictEqual(valideerAanvraag(a).ok, true);
});
test('valideer: maximaal 8 bronnen', () => {
  const a = basis();
  a.bronnen = Array.from({ length: 9 }, (_, i) => ({ type: 'link', waarde: `https://example.com/${i}` }));
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.bronnen.pop();
  assert.strictEqual(valideerAanvraag(a).ok, true);
});
test('valideer: links moeten http(s) zijn', () => {
  const a = basis();
  a.bronnen = [{ type: 'link', waarde: 'javascript:alert(1)' }];
  assert.strictEqual(valideerAanvraag(a).ok, false);
});
test('valideer: te weinig invoer wordt geweigerd, genoeg woorden of een bron is ok', () => {
  const a = basis();
  a.bronnen = []; a.punten = 'een paar woorden';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.punten = Array.from({ length: 150 }, () => 'woord').join(' ');
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.punten = ''; a.bronnen = [{ type: 'tekst', waarde: Array.from({ length: 80 }, () => 'woord').join(' ') }];
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.bronnen = [{ type: 'bestand', naam: 'x.md', inhoudBase64: b64(10) }];
  assert.strictEqual(valideerAanvraag(a).ok, true);
});
test('valideer: insteek is verplicht en moet bekend zijn', () => {
  const a = basis(); delete a.insteek;
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.insteek = 'Reclame';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  for (const i of ['Informatief', 'Technisch', 'Commercieel']) { a.insteek = i; assert.strictEqual(valideerAanvraag(a).ok, true); }
});
test('valideer: intensiteit optioneel maar beperkt tot Geen, Licht, Sterk', () => {
  const a = basis();
  a.intensiteit = 'Zwaar';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  for (const i of ['Geen', 'Licht', 'Sterk', '']) { a.intensiteit = i; assert.strictEqual(valideerAanvraag(a).ok, true, i); }
});
test('valideer: producten en affiliatelinks', () => {
  const a = basis();
  a.producten = ['WP Optin Wheel', 'SiteGround'];
  a.affiliateLinks = [{ naam: 'WP Optin Wheel', url: 'https://www.studiowombat.com/?aff=tes' }];
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.affiliateLinks = [{ naam: '', url: 'https://x.nl' }];
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.affiliateLinks = [{ naam: 'X', url: 'geen-url' }];
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.affiliateLinks = [];
  a.producten = 'geen lijst';
  assert.strictEqual(valideerAanvraag(a).ok, false);
});
test('valideer: interne link moet op kleidi.nl staan', () => {
  const a = basis();
  a.interneLink = 'https://www.kleidi.nl/blog/iets';
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.interneLink = 'https://kleidi.nl/';
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.interneLink = 'https://kleidi.nl.evil.com/x';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.interneLink = 'https://example.com/x';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.interneLink = '';
  assert.strictEqual(valideerAanvraag(a).ok, true);
});
test('valideer: datums yyyy-MM-dd en geldigTot niet voor publicatiedatum', () => {
  const a = basis();
  a.publicatiedatum = '2026-11-01'; a.geldigTot = '2026-11-30';
  assert.strictEqual(valideerAanvraag(a).ok, true);
  a.geldigTot = '2026-10-01';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.geldigTot = '30-11-2026';
  assert.strictEqual(valideerAanvraag(a).ok, false);
  a.geldigTot = '2026-02-31';
  assert.strictEqual(valideerAanvraag(a).ok, false);
});
test('valideer: geen object is ongeldig', () => {
  for (const x of [null, undefined, 'tekst', 5, []]) assert.strictEqual(valideerAanvraag(x).ok, false);
});

// ---------- handler ----------
const ENV = { TOPOS_TOEGANGSCODE: 'juiste-code', TOPOS_WEBHOOK_SECRET: 'wh-geheim', TOPOS_SESSIE_SECRET: GEHEIM };
const NU = 1_800_000_000_000;

function maakRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b || ''; res.klaar = true; };
  res.json = () => JSON.parse(res.body);
  return res;
}
function maakFetch(antwoord) {
  const f = async (url, opties) => {
    f.calls.push({ url, opties, body: JSON.parse(opties.body) });
    const a = typeof antwoord === 'function' ? antwoord(f.calls[f.calls.length - 1]) : antwoord;
    return { ok: a.ok !== false, status: a.status || 200, json: async () => a.json };
  };
  f.calls = [];
  return f;
}
async function roep(handler, { method = 'POST', body, cookie, ip = '1.2.3.4' } = {}) {
  const req = { method, headers: { 'x-forwarded-for': ip + ', 9.9.9.9' }, body };
  if (cookie) req.headers.cookie = cookie;
  const res = maakRes();
  await handler(req, res);
  return res;
}
const geldigeCookie = () => `topos_sessie=${maakSessie(GEHEIM, NU)}`;
const maak = (antwoord = { json: { ok: true } }) => {
  const fetch = maakFetch(antwoord);
  return { fetch, handler: maakHandler({ fetch, env: ENV, nu: () => NU }) };
};

test('handler: GET geeft 405 met noindex', async () => {
  const { handler } = maak();
  const res = await roep(handler, { method: 'GET' });
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers['x-robots-tag'], 'noindex');
  assert.strictEqual(res.headers['allow'], 'POST');
});
test('handler: lijst en nieuw zonder cookie geven 401 en roepen n8n niet aan', async () => {
  for (const actie of ['lijst', 'nieuw', 'clusters']) {
    const { handler, fetch } = maak();
    const res = await roep(handler, { body: { actie, ...basis() } });
    assert.strictEqual(res.statusCode, 401, actie);
    assert.strictEqual(res.headers['x-robots-tag'], 'noindex');
    assert.strictEqual(fetch.calls.length, 0);
  }
});
test('handler: verlopen of vervalste cookie geeft 401', async () => {
  const { handler } = maak();
  const oud = `topos_sessie=${maakSessie(GEHEIM, NU - 13 * UUR)}`;
  assert.strictEqual((await roep(handler, { body: { actie: 'lijst' }, cookie: oud })).statusCode, 401);
  assert.strictEqual((await roep(handler, { body: { actie: 'lijst' }, cookie: 'topos_sessie=1.abc' })).statusCode, 401);
});
test('handler: inloggen met foute code roept pogingen_check en pogingen_fout aan en zet geen cookie', async () => {
  const { handler, fetch } = maak((c) => ({ json: c.body.actie === 'pogingen_check' ? { geblokkeerd: false, minuten: 0 } : { geblokkeerd: false, minuten: 0 } }));
  const res = await roep(handler, { body: { actie: 'inloggen', code: 'verkeerd' } });
  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(fetch.calls.map((c) => c.body.actie), ['pogingen_check', 'pogingen_fout']);
  assert.strictEqual(res.headers['set-cookie'], undefined);
  const verwacht = crypto.createHash('sha256').update('1.2.3.4' + GEHEIM).digest('hex');
  assert.strictEqual(fetch.calls[1].body.sleutel, verwacht);
  assert.strictEqual(fetch.calls[0].url, 'https://n8n.sila-ai.nl/webhook/topos-api');
  assert.strictEqual(fetch.calls[0].opties.headers['X-Topos-Secret'], 'wh-geheim');
  assert.strictEqual(res.headers['x-robots-tag'], 'noindex');
});
test('handler: vijfde foute poging geeft 429 met minuten', async () => {
  const { handler } = maak((c) => ({ json: c.body.actie === 'pogingen_fout' ? { geblokkeerd: true, minuten: 15 } : { geblokkeerd: false, minuten: 0 } }));
  const res = await roep(handler, { body: { actie: 'inloggen', code: 'verkeerd' } });
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.json().minuten, 15);
});
test('handler: geblokkeerd bij pogingen_check geeft 429 zonder de code te vergelijken', async () => {
  const { handler, fetch } = maak({ json: { geblokkeerd: true, minuten: 9 } });
  const res = await roep(handler, { body: { actie: 'inloggen', code: 'juiste-code' } });
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(fetch.calls.length, 1);
  assert.strictEqual(res.headers['set-cookie'], undefined);
});
test('handler: inloggen met juiste code reset de teller en zet een veilige cookie', async () => {
  const { handler, fetch } = maak((c) => ({ json: c.body.actie === 'pogingen_reset' ? { ok: true } : { geblokkeerd: false, minuten: 0 } }));
  const res = await roep(handler, { body: { actie: 'inloggen', code: 'juiste-code' } });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(fetch.calls.map((c) => c.body.actie), ['pogingen_check', 'pogingen_reset']);
  const cookie = res.headers['set-cookie'];
  assert.match(cookie, /^topos_sessie=/);
  for (const stuk of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert.ok(cookie.includes(stuk), stuk);
  const token = cookie.split(';')[0].split('=')[1];
  assert.strictEqual(controleerSessie(token, GEHEIM, NU + UUR), true);
});
test('handler: inloggen faalt gesloten als n8n niet bereikbaar is', async () => {
  const fetch = async () => { throw new Error('netwerk'); };
  const handler = maakHandler({ fetch, env: ENV, nu: () => NU });
  const res = await roep(handler, { body: { actie: 'inloggen', code: 'juiste-code' } });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.headers['set-cookie'], undefined);
});
test('handler: uitloggen wist de cookie', async () => {
  const { handler } = maak();
  const res = await roep(handler, { body: { actie: 'uitloggen' }, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /Max-Age=0/);
});
test('handler: lijst en clusters worden doorgestuurd met geheim', async () => {
  const { handler, fetch } = maak({ json: { aanvragen: [] } });
  const res = await roep(handler, { body: { actie: 'lijst' }, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(fetch.calls[0].body, { actie: 'lijst' });
  assert.strictEqual(fetch.calls[0].opties.headers['X-Topos-Secret'], 'wh-geheim');
  await roep(handler, { body: { actie: 'clusters', klant: 'kleidi', extra: 'x' }, cookie: geldigeCookie() });
  assert.deepStrictEqual(fetch.calls[1].body, { actie: 'clusters', klant: 'kleidi' });
  const slecht = await roep(handler, { body: { actie: 'clusters', klant: 'rommel' }, cookie: geldigeCookie() });
  assert.strictEqual(slecht.statusCode, 400);
});
test('handler: nieuw met ongeldige invoer geeft 400 zonder n8n-aanroep', async () => {
  const { handler, fetch } = maak();
  const a = basis(); a.onderwerp = 'abc';
  const res = await roep(handler, { body: { actie: 'nieuw', ...a }, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.json().fout, 'ongeldig');
  assert.strictEqual(fetch.calls.length, 0);
});
test('handler: nieuw stuurt alleen bekende velden door en geeft het n8n-antwoord terug', async () => {
  const { handler, fetch } = maak({ json: { ok: true, id: 'HAND-20261028-1' } });
  const a = { actie: 'nieuw', ...basis(), producten: ['X'], affiliateLinks: [{ naam: 'X', url: 'https://a.nl' }], nietNoemen: 'prijzen', onbekend: 'weg', sessie: 'weg' };
  const res = await roep(handler, { body: a, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.json().id, 'HAND-20261028-1');
  const door = fetch.calls[0].body;
  assert.strictEqual(door.actie, 'nieuw');
  assert.strictEqual(door.onbekend, undefined);
  assert.strictEqual(door.sessie, undefined);
  assert.deepStrictEqual(door.producten, ['X']);
  assert.strictEqual(door.nietNoemen, 'prijzen');
  assert.strictEqual(door.metAfbeeldingen, true);
});
test('handler: n8n-fouten limiet, bezig en nog niet beschikbaar krijgen een passende status', async () => {
  for (const [fout, status] of [['limiet', 429], ['bezig', 409], ['ongeldig', 400], ['nog niet beschikbaar', 400]]) {
    const { handler } = maak({ json: { ok: false, fout, bericht: 'Nederlandse melding' } });
    const res = await roep(handler, { body: { actie: 'nieuw', ...basis() }, cookie: geldigeCookie() });
    assert.strictEqual(res.statusCode, status, fout);
    assert.strictEqual(res.json().fout, fout);
    assert.strictEqual(res.json().bericht, 'Nederlandse melding');
  }
});
test('handler: n8n 403 of netwerkfout wordt een nette 502 zonder geheim in het antwoord', async () => {
  const { handler } = maak({ ok: false, status: 403, json: { x: 1 } });
  const res = await roep(handler, { body: { actie: 'lijst' }, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 502);
  assert.ok(!res.body.includes('wh-geheim'));
});
test('handler: onbekende actie geeft 400, ontbrekende omgeving geeft 500', async () => {
  const { handler } = maak();
  assert.strictEqual((await roep(handler, { body: { actie: 'iets' }, cookie: geldigeCookie() })).statusCode, 400);
  const kaal = maakHandler({ fetch: maakFetch({ json: {} }), env: {}, nu: () => NU });
  const res = await roep(kaal, { body: { actie: 'lijst' } });
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.headers['x-robots-tag'], 'noindex');
});

// ---------- fixronde: bron-fout en pagina-logica ----------
test('handler: n8n-foutcode bron wordt 502 met begrijpelijke melding', async () => {
  const { handler } = maak({ json: { ok: false, fout: 'bron', bericht: 'interne n8n tekst' } });
  const res = await roep(handler, { body: { actie: 'nieuw', ...basis() }, cookie: geldigeCookie() });
  assert.strictEqual(res.statusCode, 502);
  assert.strictEqual(res.json().fout, 'bron');
  assert.strictEqual(res.json().bericht, 'De schrijf-workflow was niet bereikbaar. Probeer het zo opnieuw.');
});

// De zuivere functies van de pagina staan tussen BEGIN-LOGICA en EINDE-LOGICA in customarticle.html.
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'customarticle.html'), 'utf8');
const blok = html.slice(html.indexOf('// BEGIN-LOGICA'), html.indexOf('// EINDE-LOGICA'));
assert.ok(blok.length > 100, 'logica-blok niet gevonden in de pagina');
const pagina = new Function(`${blok}; return { bodyBytes, kortReden, veiligeDocUrl, toonProductHint, MAX_BODY_BYTES, REDEN_MAX };`)();

test('pagina: bodyBytes telt base64 mee en meer dan de bestandsgrootte', () => {
  const bestand = Buffer.alloc(3 * 1024 * 1024, 65);
  const body = { actie: 'nieuw', bronnen: [{ type: 'bestand', naam: 'a.pdf', inhoudBase64: bestand.toString('base64') }] };
  const n = pagina.bodyBytes(body);
  assert.ok(n > bestand.length * 4 / 3, 'base64 telt ruim 1/3 zwaarder');
  assert.ok(n < bestand.length * 4 / 3 + 500);
  assert.strictEqual(pagina.bodyBytes({ a: 'é' }), Buffer.byteLength(JSON.stringify({ a: 'é' })));
});
test('pagina: limiet van 4,2 MB op de body en 3 MB op bestanden werken naast elkaar', () => {
  assert.strictEqual(pagina.MAX_BODY_BYTES, Math.round(4.2 * 1024 * 1024));
  const klein = { bronnen: [{ inhoudBase64: Buffer.alloc(3 * 1024 * 1024, 1).toString('base64') }] };
  assert.ok(pagina.bodyBytes(klein) <= pagina.MAX_BODY_BYTES, '3 MB aan bestanden past nog');
  const plak = { bronnen: [klein.bronnen[0], { type: 'tekst', waarde: 'x'.repeat(400000) }] };
  assert.ok(pagina.bodyBytes(plak) > pagina.MAX_BODY_BYTES, '3 MB bestanden plus veel plaktekst is te groot');
});
test('pagina: kortReden kort in tot 300 tekens met beletselteken', () => {
  assert.strictEqual(pagina.kortReden('kort'), 'kort');
  assert.strictEqual(pagina.kortReden(undefined), '');
  const lang = 'a'.repeat(600);
  const r = pagina.kortReden(lang);
  assert.strictEqual(r.length, 301);
  assert.ok(r.endsWith('…'));
  assert.strictEqual(pagina.kortReden('b'.repeat(300)), 'b'.repeat(300));
});
test('pagina: veiligeDocUrl laat alleen https toe', () => {
  assert.strictEqual(pagina.veiligeDocUrl('https://docs.google.com/document/d/abc'), 'https://docs.google.com/document/d/abc');
  for (const u of ['http://docs.google.com/x', 'javascript:alert(1)', 'data:text/html,x', '//evil.nl', '', null, undefined, 5, 'https://']) {
    assert.strictEqual(pagina.veiligeDocUrl(u), null, String(u));
  }
});
test('pagina: productHint alleen bij producten zonder Commercieel en met intensiteit Geen', () => {
  assert.strictEqual(pagina.toonProductHint(['X'], 'Informatief', 'Geen'), true);
  assert.strictEqual(pagina.toonProductHint(['X'], 'Technisch', 'Geen'), true);
  assert.strictEqual(pagina.toonProductHint(['X'], '', 'Geen'), true);
  assert.strictEqual(pagina.toonProductHint([], 'Informatief', 'Geen'), false);
  assert.strictEqual(pagina.toonProductHint(['X'], 'Commercieel', 'Geen'), false);
  assert.strictEqual(pagina.toonProductHint(['X'], 'Informatief', 'Licht'), false);
  assert.strictEqual(pagina.toonProductHint(['X'], 'Technisch', 'Sterk'), false);
});
test('pagina: de reden wordt als tekst geplaatst, niet als HTML', () => {
  const lijst = html.slice(html.indexOf('function renderLijst'), html.indexOf('function stopTimer'));
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(html.replace(/\/\/.*$/gm, '')), 'geen HTML-injectie op de pagina');
  assert.match(lijst, /aanvraag-reden[^;]*;\s*p\.textContent = kortReden\(r\.reden\)/);
  assert.match(lijst, /veiligeDocUrl\(r\.docUrl\)/);
});
