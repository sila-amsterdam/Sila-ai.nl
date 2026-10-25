// Serverfunctie voor de besloten pagina met handmatige artikelen (POST /api/customarticle).
// Inloggen met een toegangscode, daarna doorsturen naar de n8n-workflow "Topos: API".
// Omgevingsvariabelen (Vercel): TOPOS_TOEGANGSCODE, TOPOS_WEBHOOK_SECRET, TOPOS_SESSIE_SECRET.
const crypto = require('node:crypto');
const { maakSessie, controleerSessie, GELDIG_MS } = require('./_topos/sessie.js');
const { valideerAanvraag } = require('./_topos/valideer.js');

const N8N_URL = 'https://n8n.sila-ai.nl/webhook/topos-api';
const N8N_TIMEOUT_MS = 9000;
const COOKIE = 'topos_sessie';
const KLANTEN = ['kleidi', 'optinsight'];

// Velden die naar n8n gaan bij een nieuwe aanvraag (alles daarbuiten wordt weggelaten).
const NIEUW_VELDEN = ['klant', 'onderwerp', 'punten', 'bronnen', 'insteek', 'intensiteit', 'producten', 'affiliateLinks',
  'interneLink', 'nietNoemen', 'publicatiedatum', 'geldigTot', 'invalshoek', 'cluster', 'zoekterm', 'metAfbeeldingen'];

// Status per foutcode die n8n teruggeeft bij een afgewezen nieuwe aanvraag.
const FOUT_STATUS = { limiet: 429, bezig: 409, ongeldig: 400, 'nog niet beschikbaar': 400, bron: 502 };
const BRON_BERICHT = 'De schrijf-workflow was niet bereikbaar. Probeer het zo opnieuw.';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

function gelijk(a, b) {
  return crypto.timingSafeEqual(sha256(String(a)), sha256(String(b)));
}

function leesCookie(header, naam) {
  if (typeof header !== 'string') return undefined;
  for (const stuk of header.split(';')) {
    const i = stuk.indexOf('=');
    if (i > 0 && stuk.slice(0, i).trim() === naam) return stuk.slice(i + 1).trim();
  }
  return undefined;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return String(req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'onbekend');
}

async function leesBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return null; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch (e) { return null; } }
    return req.body;
  }
  if (typeof req.on !== 'function') return null;
  const delen = [];
  for await (const d of req) delen.push(d);
  try { return JSON.parse(Buffer.concat(delen).toString('utf8')); } catch (e) { return null; }
}

function maakHandler(deps = {}) {
  const doeFetch = deps.fetch || ((...a) => fetch(...a));
  const env = deps.env || process.env;
  const nu = deps.nu || (() => Date.now());

  async function naarN8n(payload) {
    const antwoord = await doeFetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Topos-Secret': env.TOPOS_WEBHOOK_SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS)
    });
    if (!antwoord.ok) throw new Error('n8n antwoordde met status ' + antwoord.status);
    return antwoord.json();
  }

  return async function handler(req, res) {
    const stuur = (status, obj, extraHeaders) => {
      res.statusCode = status;
      res.setHeader('X-Robots-Tag', 'noindex');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      for (const [k, v] of Object.entries(extraHeaders || {})) res.setHeader(k, v);
      res.end(JSON.stringify(obj));
    };
    const bronFout = () => stuur(502, { ok: false, fout: 'bron', bericht: 'De koppeling met de artikelmachine reageert niet. Probeer het over een minuut opnieuw.' });

    if (req.method !== 'POST') return stuur(405, { ok: false, fout: 'methode', bericht: 'Alleen POST is toegestaan.' }, { Allow: 'POST' });

    if (!env.TOPOS_TOEGANGSCODE || !env.TOPOS_WEBHOOK_SECRET || !env.TOPOS_SESSIE_SECRET) {
      return stuur(500, { ok: false, fout: 'configuratie', bericht: 'De pagina is nog niet ingesteld. Neem contact op met Jamal.' });
    }

    const body = await leesBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return stuur(400, { ok: false, fout: 'ongeldig', bericht: 'De aanvraag is niet leesbaar.' });
    const actie = body.actie;

    if (actie === 'inloggen') {
      const sleutel = crypto.createHash('sha256').update(clientIp(req) + env.TOPOS_SESSIE_SECRET).digest('hex');
      try {
        const check = await naarN8n({ actie: 'pogingen_check', sleutel });
        if (check && check.geblokkeerd) {
          return stuur(429, { ok: false, fout: 'geblokkeerd', minuten: check.minuten, bericht: `Te veel pogingen. Probeer het over ${check.minuten} minuten opnieuw.` });
        }
        if (typeof body.code === 'string' && body.code.length > 0 && body.code.length <= 200 && gelijk(body.code, env.TOPOS_TOEGANGSCODE)) {
          await naarN8n({ actie: 'pogingen_reset', sleutel });
          const token = maakSessie(env.TOPOS_SESSIE_SECRET, nu());
          return stuur(200, { ok: true }, {
            'Set-Cookie': `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${GELDIG_MS / 1000}`
          });
        }
        const fout = await naarN8n({ actie: 'pogingen_fout', sleutel });
        if (fout && fout.geblokkeerd) {
          return stuur(429, { ok: false, fout: 'geblokkeerd', minuten: fout.minuten, bericht: `Te veel pogingen. Probeer het over ${fout.minuten} minuten opnieuw.` });
        }
        return stuur(401, { ok: false, fout: 'code', bericht: 'Die toegangscode klopt niet.' });
      } catch (e) {
        return bronFout();
      }
    }

    if (actie === 'uitloggen') {
      return stuur(200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0` });
    }

    if (!['clusters', 'lijst', 'nieuw'].includes(actie)) {
      return stuur(400, { ok: false, fout: 'ongeldig', bericht: 'Onbekende actie.' });
    }

    if (!controleerSessie(leesCookie(req.headers.cookie, COOKIE), env.TOPOS_SESSIE_SECRET, nu())) {
      return stuur(401, { ok: false, fout: 'niet ingelogd', bericht: 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.' });
    }

    try {
      if (actie === 'lijst') return stuur(200, await naarN8n({ actie: 'lijst' }));

      if (actie === 'clusters') {
        if (!KLANTEN.includes(body.klant)) return stuur(400, { ok: false, fout: 'ongeldig', bericht: 'Kies een klant.' });
        return stuur(200, await naarN8n({ actie: 'clusters', klant: body.klant }));
      }

      const v = valideerAanvraag(body);
      if (!v.ok) return stuur(400, { ok: false, fout: 'ongeldig', bericht: v.fout });
      const payload = { actie: 'nieuw' };
      for (const veld of NIEUW_VELDEN) if (body[veld] !== undefined) payload[veld] = body[veld];
      const antwoord = await naarN8n(payload);
      if (antwoord && antwoord.ok === false) {
        if (antwoord.fout === 'bron') return stuur(502, { ok: false, fout: 'bron', bericht: BRON_BERICHT });
        return stuur(FOUT_STATUS[antwoord.fout] || 400, antwoord);
      }
      return stuur(200, antwoord);
    } catch (e) {
      return bronFout();
    }
  };
}

module.exports = maakHandler();
module.exports.maakHandler = maakHandler;
