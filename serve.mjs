import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMollieClient } from '@mollie/api-client';
import nodemailer from 'nodemailer';
import { CURSUSSEN } from './cursussen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.transip.email',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Betalingen opslag ────────────────────────────────────────────
const BETALINGEN_PAD = path.join(__dirname, 'betalingen.json');

function laadBetalingen() {
  try {
    return JSON.parse(fs.readFileSync(BETALINGEN_PAD, 'utf8'));
  } catch {
    return {};
  }
}

function slaBetalingenOp(data) {
  fs.writeFileSync(BETALINGEN_PAD, JSON.stringify(data, null, 2));
}

// ── Helper: JSON body lezen ──────────────────────────────────────
function leesBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Bevestigingse-mail sturen ────────────────────────────────────
async function stuurBevestigingEmail(email, cursus, token) {
  const downloadUrl = `${BASE_URL}/api/download?token=${token}`;
  const prijsFormatted = `€${(cursus.prijs / 100).toFixed(2).replace('.', ',')}`;

  await mailer.sendMail({
    from: `Sila <${process.env.EMAIL_FROM || 'info@sila.nl'}>`,
    to: email,
    subject: `Je cursus: ${cursus.naam} — downloadlink`,
    html: `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9F7F4;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#DC5A14;padding:32px 40px;">
      <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.01em;">Sila</p>
    </div>
    <div style="padding:40px;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#231D18;font-weight:700;">Bedankt voor je aankoop!</h1>
      <p style="margin:0 0 24px;color:#7A7167;font-size:15px;">Je betaling van <strong>${prijsFormatted}</strong> is ontvangen.</p>

      <div style="background:#F5E6DD;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#7A7167;">Jouw cursus</p>
        <p style="margin:0;font-size:17px;font-weight:700;color:#231D18;">${cursus.naam}</p>
      </div>

      <p style="margin:0 0 20px;color:#231D18;font-size:15px;">Klik op de knop hieronder om je cursus te downloaden. De link is 24 uur geldig en kan één keer worden gebruikt.</p>

      <a href="${downloadUrl}" style="display:inline-block;background:#DC5A14;color:#fff;text-decoration:none;padding:14px 28px;border-radius:9999px;font-weight:600;font-size:15px;">
        Download je cursus →
      </a>

      <hr style="margin:32px 0;border:none;border-top:1px solid #E3DDD5;">
      <p style="margin:0;color:#7A7167;font-size:13px;">Vragen? Neem contact op via <a href="mailto:info@sila.nl" style="color:#DC5A14;">info@sila.nl</a></p>
    </div>
    <div style="background:#1A1410;padding:20px 40px;">
      <p style="margin:0;color:#7A7167;font-size:12px;">© 2026 Sila — <a href="https://www.sila-ai.nl" style="color:#DC5A14;text-decoration:none;">sila-ai.nl</a></p>
    </div>
  </div>
</body>
</html>`,
  });
}

// ── MIME types ───────────────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ── Server ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;

  // ── POST /api/betaling/aanmaken ──────────────────────────────
  if (urlPath === '/api/betaling/aanmaken' && req.method === 'POST') {
    try {
      const body = await leesBody(req);
      const { cursusId, email } = body;

      if (!cursusId || !email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fout: 'cursusId en email zijn verplicht' }));
        return;
      }

      const cursus = CURSUSSEN[cursusId];
      if (!cursus || cursus.prijs === null) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fout: 'Cursus niet gevonden of niet beschikbaar voor directe aankoop' }));
        return;
      }

      const token = crypto.randomUUID();
      const prijsWaarde = (cursus.prijs / 100).toFixed(2);

      const betaling = await mollie.payments.create({
        amount: { currency: 'EUR', value: prijsWaarde },
        description: cursus.beschrijving,
        redirectUrl: `${BASE_URL}/betaling-succes.html?token=${token}`,
        metadata: { cursusId, token },
      });

      const betalingen = laadBetalingen();
      betalingen[token] = {
        token,
        cursusId,
        email,
        status: 'pending',
        paymentId: betaling.id,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        used: false,
        aangemaakt: new Date().toISOString(),
      };
      slaBetalingenOp(betalingen);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ checkoutUrl: betaling.getCheckoutUrl() }));
    } catch (err) {
      console.error('Fout bij aanmaken betaling:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ fout: 'Er ging iets mis. Probeer het opnieuw.' }));
    }
    return;
  }

  // ── POST /api/betaling/webhook ───────────────────────────────
  if (urlPath === '/api/betaling/webhook' && req.method === 'POST') {
    try {
      const body = await leesBody(req);
      const paymentId = body.id;

      if (paymentId) {
        const betaling = await mollie.payments.get(paymentId);

        if (betaling.status === 'paid') {
          const betalingen = laadBetalingen();
          const token = betaling.metadata?.token;

          if (token && betalingen[token]) {
            betalingen[token].status = 'active';
            betalingen[token].betaaldOp = new Date().toISOString();
            slaBetalingenOp(betalingen);

            const cursus = CURSUSSEN[betalingen[token].cursusId];
            if (cursus) {
              try {
                await stuurBevestigingEmail(betalingen[token].email, cursus, token);
              } catch (emailErr) {
                console.error('E-mail kon niet worden verstuurd:', emailErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Webhook fout:', err);
    }
    // Mollie verwacht altijd 200 OK
    res.writeHead(200);
    res.end();
    return;
  }

  // ── GET /api/betaling/status?token=... ───────────────────────
  if (urlPath === '/api/betaling/status' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const betalingen = laadBetalingen();
    const record = betalingen[token];

    if (!record) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'niet_gevonden' }));
      return;
    }

    const verlopen = new Date(record.expires) < new Date();
    if (verlopen) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'verlopen', cursusId: record.cursusId }));
      return;
    }

    // Als nog pending: check Mollie direct voor actuele status
    if (record.status === 'pending' && record.paymentId) {
      try {
        const molliePayment = await mollie.payments.get(record.paymentId);
        if (molliePayment.status === 'paid') {
          betalingen[token].status = 'active';
          betalingen[token].betaaldOp = new Date().toISOString();
          slaBetalingenOp(betalingen);

          const cursus = CURSUSSEN[record.cursusId];
          if (cursus) {
            stuurBevestigingEmail(record.email, cursus, token).catch(err =>
              console.error('E-mail kon niet worden verstuurd:', err)
            );
          }
        }
      } catch (err) {
        console.error('Fout bij ophalen Mollie status:', err.message);
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: betalingen[token].status, cursusId: record.cursusId }));
    return;
  }

  // ── GET /api/download?token=... ──────────────────────────────
  if (urlPath === '/api/download' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const betalingen = laadBetalingen();
    const record = betalingen[token];

    if (!record) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<p>Ongeldige downloadlink.</p>');
      return;
    }

    if (record.status !== 'active') {
      res.writeHead(402, { 'Content-Type': 'text/html' });
      res.end('<p>Betaling nog niet bevestigd. Wacht even en probeer opnieuw.</p>');
      return;
    }

    if (new Date(record.expires) < new Date()) {
      res.writeHead(410, { 'Content-Type': 'text/html' });
      res.end('<p>Deze downloadlink is verlopen. Neem contact op via info@sila-ai.nl</p>');
      return;
    }

    if (record.used) {
      res.writeHead(410, { 'Content-Type': 'text/html' });
      res.end('<p>Deze downloadlink is al gebruikt. Neem contact op via info@sila-ai.nl als je de download opnieuw nodig hebt.</p>');
      return;
    }

    const cursus = CURSUSSEN[record.cursusId];
    if (!cursus || !cursus.pdf) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<p>PDF niet gevonden. Neem contact op via info@sila-ai.nl</p>');
      return;
    }

    const pdfPad = path.join(__dirname, 'pdf-cursussen', cursus.pdf);
    if (!fs.existsSync(pdfPad)) {
      res.writeHead(503, { 'Content-Type': 'text/html' });
      res.end('<p>De PDF is nog niet beschikbaar. We nemen zo snel mogelijk contact met je op.</p>');
      return;
    }

    // Token als gebruikt markeren vóórdat we sturen
    betalingen[token].used = true;
    betalingen[token].gedownloadOp = new Date().toISOString();
    slaBetalingenOp(betalingen);

    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${cursus.pdf}"`,
    });
    fs.createReadStream(pdfPad).pipe(res);
    return;
  }

  // ── Statische bestanden ──────────────────────────────────────
  let staticPath = urlPath;
  if (staticPath === '/') staticPath = '/index.html';

  // Blokkeer toegang tot pdf-cursussen map
  if (staticPath.startsWith('/pdf-cursussen')) {
    res.writeHead(403);
    res.end('Geen toegang');
    return;
  }

  const filePath = path.join(__dirname, staticPath);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
