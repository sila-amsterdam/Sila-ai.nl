// Validatie voor een feedbackmelding op /toposadmin. Zelfstandig bestand (geen require): het bouwscript van de
// n8n-workflow "Topos: API" neemt de functie letterlijk over, zodat website en n8n dezelfde regels gebruiken.
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const FEEDBACK_KLANTEN = ['kleidi', 'optinsight'];
const SCREENSHOT_MIME = ['image/png', 'image/jpeg'];
const FEEDBACK_VELDEN = ['klant', 'artikel', 'artikelLink', 'feedback', 'uitleg', 'link', 'screenshot', 'bijlagen', 'prioriteit'];
const STATUSSEN = ['Nieuw', 'In behandeling', 'Verwerkt'];
const STATUS_VELDEN = ['klant', 'id', 'status', 'reactie'];
// Bijlagen: maximaal 5 bestanden en samen 3 MB (het verzoek naar de server mag niet groter dan ongeveer 4,5 MB zijn).
const MAX_BIJLAGEN = 5;
const MAX_BIJLAGEN_BYTES = 3 * 1024 * 1024;
const BIJLAGE_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', odp: 'application/vnd.oasis.opendocument.presentation',
  pages: 'application/vnd.apple.pages', numbers: 'application/vnd.apple.numbers', key: 'application/vnd.apple.keynote',
  rtf: 'application/rtf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html', htm: 'text/html',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook', zip: 'application/zip', mp4: 'video/mp4', mov: 'video/quicktime'
};
const PRIORITEITEN = ['Hoog', 'Midden', 'Laag'];
const PRIORITEIT_VELDEN = ['klant', 'id', 'prioriteit'];
const NOTITIE_VELDEN = ['klant', 'id', 'van', 'notitie', 'screenshot', 'bijlagen'];
const NOTITIE_NAMEN = ['Tes', 'Jamal'];

const fbFout = (tekst) => ({ ok: false, fout: tekst });
const fbTekst = (x) => typeof x === 'string';

// Geen globale URL: die bestaat niet in de n8n Code-node. Een eigen controle met dezelfde uitkomst (http of https, met host).
function fbHttpUrl(s) {
  if (!fbTekst(s) || s.length > 2000) return false;
  return /^https?:\/\/(?:[^\/?#@\s]*@)?(\[[0-9a-fA-F:.]+\]|[^\/?#:@\s]+)(?::(\d{1,5}))?(?:[\/?#][\s\S]*)?$/i.test(s.trim());
}

function fbBase64Bytes(b64) {
  if (!fbTekst(b64) || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) return -1;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function valideerFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fbFout('De melding is niet leesbaar.');
  if (!FEEDBACK_KLANTEN.includes(body.klant)) return fbFout('Kies een klant.');

  const feedback = fbTekst(body.feedback) ? body.feedback.trim() : '';
  if (feedback.length < 5) return fbFout('Beschrijf de feedback in minstens 5 tekens.');
  if (feedback.length > 200) return fbFout('De korte feedbackregel is te lang. Gebruik maximaal 200 tekens en zet de rest bij de uitleg.');

  const uitleg = fbTekst(body.uitleg) ? body.uitleg.trim() : '';
  if (uitleg.length < 10) return fbFout('Leg kort uit wat je precies bedoelt, in minstens 10 tekens.');
  if (uitleg.length > 5000) return fbFout('De uitleg is te lang. Gebruik maximaal 5.000 tekens.');

  const artikel = fbTekst(body.artikel) ? body.artikel.trim() : '';
  if (!artikel) return fbFout('Kies een artikel, of kies "Algemeen" als het niet over één artikel gaat.');
  if (artikel.length > 300) return fbFout('De naam van het artikel is te lang. Gebruik maximaal 300 tekens.');
  if (body.artikelLink != null && body.artikelLink !== '' && !fbHttpUrl(body.artikelLink)) return fbFout('De link naar het artikel is geen geldige weblink.');
  if (body.link != null && body.link !== '' && !fbHttpUrl(body.link)) return fbFout('De link is geen geldige weblink. Begin met https://.');
  if (body.prioriteit != null && !PRIORITEITEN.includes(body.prioriteit)) return fbFout('Kies als prioriteit Hoog, Midden of Laag.');

  return fbAlleBestanden(body);
}

function fbAlleBestanden(body) {
  const s = fbScreenshot(body.screenshot);
  return s.ok ? fbBijlagen(body.bijlagen) : s;
}

function fbExtensie(naam) {
  const m = /\.([A-Za-z0-9]+)$/.exec(fbTekst(naam) ? naam.trim() : '');
  return m ? m[1].toLowerCase() : '';
}

// Veilige bestandsnaam: geen schuine strepen, streepje-kolom (scheidingsteken in het sheet) of regeleinden, en niet te lang.
function fbBestandsnaam(naam) {
  const t = String(naam).replace(/[\\\/|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= 120) return t;
  const ext = fbExtensie(t);
  return t.slice(0, 118 - ext.length).trim() + '.' + ext;
}

function fbBijlagen(lijst) {
  if (lijst == null) return { ok: true };
  if (!Array.isArray(lijst)) return fbFout('De bijlagen zijn niet geldig.');
  if (lijst.length > MAX_BIJLAGEN) return fbFout(`Voeg maximaal ${MAX_BIJLAGEN} bestanden toe.`);
  let totaal = 0;
  for (const b of lijst) {
    if (!b || typeof b !== 'object' || !fbTekst(b.naam) || !b.naam.trim()) return fbFout('Een van de bijlagen is niet geldig.');
    if (!Object.prototype.hasOwnProperty.call(BIJLAGE_TYPES, fbExtensie(b.naam))) return fbFout(`"${b.naam}" kan niet worden gebruikt. Kies bijvoorbeeld een pdf, Word, Excel, PowerPoint, csv, tekstbestand, afbeelding of zip.`);
    const n = fbBase64Bytes(b.inhoudBase64);
    if (n < 0) return fbFout(`"${b.naam}" kon niet worden gelezen.`);
    if (n === 0) return fbFout(`"${b.naam}" is leeg.`);
    totaal += n;
  }
  if (totaal > MAX_BIJLAGEN_BYTES) return fbFout('De bestanden zijn samen groter dan 3 MB. Zet grote bestanden in Google Drive en deel de link.');
  return { ok: true };
}

// Alle bestanden van een geldig verzoek in een vorm (gebruikt door de n8n-workflow). scherm = het oude veld voor een schermafbeelding.
function fbBestanden(body) {
  const uit = [];
  const s = body.screenshot;
  if (s) uit.push({ naam: 'schermafbeelding.' + (s.mime === 'image/png' ? 'png' : 'jpg'), mime: s.mime, inhoudBase64: s.inhoudBase64, scherm: true });
  for (const b of body.bijlagen || []) uit.push({ naam: fbBestandsnaam(b.naam), mime: BIJLAGE_TYPES[fbExtensie(b.naam)], inhoudBase64: b.inhoudBase64, scherm: false });
  return uit;
}

function fbScreenshot(s) {
  if (s == null) return { ok: true };
  if (typeof s !== 'object' || Array.isArray(s)) return fbFout('De schermafbeelding is niet geldig.');
  const naam = fbTekst(s.naam) ? s.naam : 'Schermafbeelding';
  if (!SCREENSHOT_MIME.includes(s.mime)) return fbFout(`"${naam}" kan niet worden gebruikt. Kies een png of jpg.`);
  const n = fbBase64Bytes(s.inhoudBase64);
  if (n < 0) return fbFout(`"${naam}" kon niet worden gelezen.`);
  if (n === 0) return fbFout(`"${naam}" is leeg.`);
  if (n > MAX_SCREENSHOT_BYTES) return fbFout('De schermafbeelding is groter dan 2 MB. Kies een kleinere afbeelding.');
  return { ok: true };
}

// Een verzoek over een bestaande melding: leesbaar, bekende klant en een nummer als FB-20261125-4.
function fbBestaande(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fbFout('Het verzoek is niet leesbaar.');
  if (!FEEDBACK_KLANTEN.includes(body.klant)) return fbFout('Kies een klant.');
  if (!fbTekst(body.id) || !/^FB-\d{8}-\d{1,4}$/.test(body.id)) return fbFout('Deze melding is niet herkend. Ververs de lijst en probeer het opnieuw.');
  return { ok: true };
}

function valideerPrioriteit(body) {
  const b = fbBestaande(body);
  if (!b.ok) return b;
  if (!PRIORITEITEN.includes(body.prioriteit)) return fbFout('Kies als prioriteit Hoog, Midden of Laag.');
  return { ok: true };
}

function valideerNotitie(body) {
  const b = fbBestaande(body);
  if (!b.ok) return b;
  if (!NOTITIE_NAMEN.includes(body.van)) return fbFout('Kies van wie de notitie is.');
  const notitie = fbTekst(body.notitie) ? body.notitie.trim() : '';
  const heeftBestand = !!body.screenshot || (Array.isArray(body.bijlagen) && body.bijlagen.length > 0);
  if (notitie.length < 2 && !heeftBestand) return fbFout('Schrijf eerst je notitie of voeg een bestand toe.');
  if (notitie.length > 5000) return fbFout('De notitie is te lang. Gebruik maximaal 5.000 tekens.');
  return fbAlleBestanden(body);
}

// Afhandelen: status en reactie van een bestaande melding. Een lege reactie wist de reactie.
function valideerStatus(body) {
  const b = fbBestaande(body);
  if (!b.ok) return b;
  if (!STATUSSEN.includes(body.status)) return fbFout('Kies als status Nieuw, In behandeling of Verwerkt.');
  if (!fbTekst(body.reactie)) return fbFout('De reactie is niet leesbaar.');
  if (body.reactie.trim().length > 3000) return fbFout('De reactie is te lang. Gebruik maximaal 3.000 tekens.');
  return { ok: true };
}

module.exports = { valideerFeedback, valideerPrioriteit, valideerNotitie, valideerStatus, fbBestanden, MAX_SCREENSHOT_BYTES, MAX_BIJLAGEN, MAX_BIJLAGEN_BYTES, BIJLAGE_TYPES, FEEDBACK_VELDEN, PRIORITEIT_VELDEN, NOTITIE_VELDEN, STATUS_VELDEN };
