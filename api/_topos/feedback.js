// Validatie voor een feedbackmelding op /toposadmin. Zelfstandig bestand (geen require): het bouwscript van de
// n8n-workflow "Topos: API" neemt de functie letterlijk over, zodat website en n8n dezelfde regels gebruiken.
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const FEEDBACK_KLANTEN = ['kleidi', 'optinsight'];
const SCREENSHOT_MIME = ['image/png', 'image/jpeg'];
const FEEDBACK_VELDEN = ['klant', 'artikel', 'feedback', 'uitleg', 'link', 'screenshot'];

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

  if (body.artikel != null && (!fbTekst(body.artikel) || body.artikel.length > 300)) return fbFout('De naam van het artikel is te lang. Gebruik maximaal 300 tekens.');
  if (body.link != null && body.link !== '' && !fbHttpUrl(body.link)) return fbFout('De link is geen geldige weblink. Begin met https://.');

  if (body.screenshot != null) {
    const s = body.screenshot;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return fbFout('De schermafbeelding is niet geldig.');
    const naam = fbTekst(s.naam) ? s.naam : 'Schermafbeelding';
    if (!SCREENSHOT_MIME.includes(s.mime)) return fbFout(`"${naam}" kan niet worden gebruikt. Kies een png of jpg.`);
    const n = fbBase64Bytes(s.inhoudBase64);
    if (n < 0) return fbFout(`"${naam}" kon niet worden gelezen.`);
    if (n === 0) return fbFout(`"${naam}" is leeg.`);
    if (n > MAX_SCREENSHOT_BYTES) return fbFout('De schermafbeelding is groter dan 2 MB. Kies een kleinere afbeelding.');
  }
  return { ok: true };
}

module.exports = { valideerFeedback, MAX_SCREENSHOT_BYTES, FEEDBACK_VELDEN };
