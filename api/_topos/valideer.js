// Snelle validatie voor een nieuwe aanvraag (spiegel van de n8n-validatie in "Topos: API").
// De n8n-kant blijft leidend: hier alleen om snel en duidelijk feedback te geven en rommel te weren.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // pdf, tekst en afbeeldingen samen
const MAX_BRONNEN = 8;
const MIN_WOORDEN = 150;
const KLANTEN = ['kleidi', 'optinsight'];
const INSTEKEN = ['Informatief', 'Technisch', 'Commercieel'];
const INSTEKEN_OI = ['Informatief', 'Technisch'];   // OptInsight: geen insteek Commercieel
const INTERNE_HOSTS = { kleidi: ['kleidi.nl', 'www.kleidi.nl'], optinsight: ['opt-insight.com', 'www.opt-insight.com'] };
const INTERNE_NAAM = { kleidi: 'kleidi.nl', optinsight: 'opt-insight.com' };
const INTENSITEITEN = ['Geen', 'Licht', 'Sterk'];
const BESTAND_EXT = ['pdf', 'txt', 'md'];
const AFBEELDING_MIME = ['image/png', 'image/jpeg'];

const fout = (tekst) => ({ ok: false, fout: tekst });
const isTekst = (x) => typeof x === 'string';
const woorden = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function isHttpUrl(s) {
  if (!isTekst(s) || s.length > 2000) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) { return false; }
}

function isInterneUrl(s, klant) {
  if (!isHttpUrl(s)) return false;
  return INTERNE_HOSTS[klant].includes(new URL(s.trim()).hostname.toLowerCase());
}

function isDatum(s) {
  if (!isTekst(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Grootte van de bytes achter een base64-tekst, zonder te decoderen.
function base64Bytes(b64) {
  if (!isTekst(b64) || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) return -1;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function valideerAanvraag(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fout('De aanvraag is niet leesbaar.');

  if (!KLANTEN.includes(body.klant)) return fout('Kies een klant.');
  const oi = body.klant === 'optinsight';   // OptInsight: producten, affiliatelinks, intensiteit en geldigTot worden genegeerd

  const onderwerp = isTekst(body.onderwerp) ? body.onderwerp.trim() : '';
  if (onderwerp.length < 5) return fout('Het onderwerp is te kort. Gebruik minstens 5 tekens.');
  if (onderwerp.length > 200) return fout('Het onderwerp is te lang. Gebruik maximaal 200 tekens.');

  if (body.punten != null && (!isTekst(body.punten) || body.punten.length > 10000)) return fout('De punten zijn te lang. Gebruik maximaal 10.000 tekens.');
  if (oi ? !INSTEKEN_OI.includes(body.insteek) : !INSTEKEN.includes(body.insteek)) return fout(oi ? 'Kies een primaire insteek: informatief of technisch.' : 'Kies een primaire insteek: informatief, technisch of commercieel.');
  if (!oi && body.intensiteit != null && body.intensiteit !== '' && !INTENSITEITEN.includes(body.intensiteit)) return fout('Kies een commerciële intensiteit: geen, licht of sterk.');
  if (body.invalshoek != null && (!isTekst(body.invalshoek) || body.invalshoek.length > 1000)) return fout('De invalshoek is te lang. Gebruik maximaal 1000 tekens.');
  if (body.zoekterm != null && (!isTekst(body.zoekterm) || body.zoekterm.length > 150)) return fout('De zoekterm is te lang. Gebruik maximaal 150 tekens.');
  if (body.cluster != null && !isTekst(body.cluster) && typeof body.cluster !== 'number') return fout('Het cluster is niet geldig.');
  if (body.nietNoemen != null && (!isTekst(body.nietNoemen) || body.nietNoemen.length > 2000)) return fout('Het veld "niet noemen" is te lang. Gebruik maximaal 2000 tekens.');
  if (body.metAfbeeldingen != null && typeof body.metAfbeeldingen !== 'boolean') return fout('De keuze voor afbeeldingen is niet geldig.');

  if (!oi && body.producten != null) {
    if (!Array.isArray(body.producten) || body.producten.length > 20 || body.producten.some((p) => !isTekst(p) || !p.trim() || p.length > 120)) {
      return fout('De lijst met producten is niet geldig. Gebruik maximaal 20 producten van elk maximaal 120 tekens.');
    }
  }
  if (!oi && body.affiliateLinks != null) {
    const l = body.affiliateLinks;
    if (!Array.isArray(l) || l.length > 10) return fout('Je kunt maximaal 10 affiliate- of referral-links opgeven.');
    for (const a of l) {
      if (!a || !isTekst(a.naam) || !a.naam.trim() || a.naam.length > 120) return fout('Geef elke affiliate- of referral-link een naam.');
      if (!isHttpUrl(a.url)) return fout(`De link bij "${a.naam}" is geen geldige weblink. Begin met https://.`);
    }
  }
  if (body.interneLink != null && body.interneLink !== '' && !isInterneUrl(body.interneLink, body.klant)) return fout(`De interne link moet een pagina op ${INTERNE_NAAM[body.klant]} zijn.`);

  for (const veld of oi ? ['publicatiedatum'] : ['publicatiedatum', 'geldigTot']) {
    if (body[veld] != null && body[veld] !== '' && !isDatum(body[veld])) return fout(`De datum bij ${veld === 'geldigTot' ? '"geldig tot"' : '"publicatiedatum"'} is niet geldig.`);
  }
  if (!oi && body.publicatiedatum && body.geldigTot && body.geldigTot < body.publicatiedatum) return fout('"Geldig tot" ligt voor de publicatiedatum.');

  const bronnen = body.bronnen == null ? [] : body.bronnen;
  if (!Array.isArray(bronnen)) return fout('De bronnen zijn niet geldig.');
  if (bronnen.length > MAX_BRONNEN) return fout(`Je kunt maximaal ${MAX_BRONNEN} bronnen per aanvraag gebruiken.`);

  let bytes = 0;
  let bronnenMetInhoud = 0;
  let tekstWoorden = woorden(isTekst(body.punten) ? body.punten : '');
  for (const b of bronnen) {
    if (!b || typeof b !== 'object') return fout('Een van de bronnen is niet geldig.');
    if (b.type === 'link') {
      if (!isHttpUrl(b.waarde)) return fout('Een van de links is geen geldige weblink. Begin met https://.');
      bronnenMetInhoud++;
    } else if (b.type === 'tekst') {
      if (!isTekst(b.waarde) || b.waarde.length > 200000) return fout('Een geplakte tekst is te lang of leeg.');
      tekstWoorden += woorden(b.waarde);
    } else if (b.type === 'bestand' || b.type === 'afbeelding') {
      const naam = isTekst(b.naam) ? b.naam : '';
      const m = /\.([A-Za-z0-9]+)$/.exec(naam);
      const ext = m ? m[1].toLowerCase() : '';
      if (b.type === 'bestand' && !BESTAND_EXT.includes(ext)) return fout(`"${naam || 'Bestand'}" kan niet worden gebruikt. Kies een pdf, txt of md.`);
      if (b.type === 'afbeelding' && !AFBEELDING_MIME.includes(b.mime)) return fout(`"${naam || 'Afbeelding'}" kan niet worden gebruikt. Kies een png of jpg.`);
      const n = base64Bytes(b.inhoudBase64);
      if (n < 0) return fout(`"${naam}" kon niet worden gelezen.`);
      if (n === 0) return fout(`"${naam}" is leeg.`);
      bytes += n;
      bronnenMetInhoud++;
    } else {
      return fout('Een van de bronnen heeft een onbekend type.');
    }
  }
  if (bytes > MAX_UPLOAD_BYTES) return fout('De bestanden zijn samen groter dan 3 MB. Kies kleinere bestanden of minder bestanden.');

  if (bronnenMetInhoud === 0 && tekstWoorden < MIN_WOORDEN) {
    return fout('Er is te weinig invoer. Voeg een link, een bestand of een afbeelding toe, of schrijf minstens 150 woorden aan punten of geplakte tekst.');
  }
  return { ok: true };
}

module.exports = { valideerAanvraag, MAX_UPLOAD_BYTES, MAX_BRONNEN, MIN_WOORDEN };
