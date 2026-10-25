// Sessietoken voor /customarticle: "<verlooptijd in ms>.<HMAC-SHA256 hex>". Geldig 12 uur.
const crypto = require('node:crypto');

const GELDIG_MS = 12 * 60 * 60 * 1000;

function teken(exp, geheim) {
  return crypto.createHmac('sha256', geheim).update(String(exp)).digest('hex');
}

function maakSessie(geheim, nu) {
  const exp = nu + GELDIG_MS;
  return `${exp}.${teken(exp, geheim)}`;
}

function controleerSessie(token, geheim, nu) {
  if (typeof token !== 'string' || typeof geheim !== 'string' || !geheim) return false;
  const delen = token.split('.');
  if (delen.length !== 2) return false;
  const [exp, sig] = delen;
  if (!/^\d{1,16}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const verwacht = Buffer.from(teken(exp, geheim), 'hex');
  const gekregen = Buffer.from(sig, 'hex');
  if (verwacht.length !== gekregen.length || !crypto.timingSafeEqual(verwacht, gekregen)) return false;
  return nu < Number(exp);
}

module.exports = { maakSessie, controleerSessie, GELDIG_MS };
