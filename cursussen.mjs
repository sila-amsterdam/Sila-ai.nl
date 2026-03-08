// cursussen.mjs — Centrale autoriteit voor cursusdata en prijzen
// Prijzen in eurocenten. Pas hier aan — NOOIT in de frontend.
// pdf: bestandsnaam in de pdf-cursussen/ map (of null als nog niet beschikbaar)

export const CURSUSSEN = {
  // ── Workshops ───────────────────────────────────────────────────
  'ai-basics-ondernemers': {
    naam: 'AI Basics voor Ondernemers',
    prijs: 19900,           // €199,00
    beschrijving: 'AI Basics voor Ondernemers — 4 weken online workshop',
    pdf: 'ai-basics-ondernemers.pdf',
  },
  'chatgpt-masterclass': {
    naam: 'ChatGPT Masterclass',
    prijs: 14900,           // €149,00 — placeholder, pas aan
    beschrijving: 'ChatGPT Masterclass — 2 weken online workshop',
    pdf: 'chatgpt-masterclass.pdf',
  },
  'ai-workshop-locatie': {
    naam: 'AI Workshop op Locatie',
    prijs: null,            // Op aanvraag — geen directe betaling
    beschrijving: null,
    pdf: null,
  },

  // ── Online cursussen ─────────────────────────────────────────────
  'starten-met-automatiseren': {
    naam: 'Hoe begin ik met automatiseren?',
    prijs: 7900,            // €79,00 — placeholder, pas aan
    beschrijving: 'Online cursus: Hoe begin ik met automatiseren?',
    pdf: 'starten-met-automatiseren.pdf',
  },
  'ai-tools-vandaag': {
    naam: 'Welke AI tools zijn vandaag nodig?',
    prijs: 7900,            // €79,00 — placeholder, pas aan
    beschrijving: 'Online cursus: Welke AI tools zijn vandaag nodig?',
    pdf: 'ai-tools-vandaag.pdf',
  },
  'hoe-gebruik-ik-n8n': {
    naam: 'Hoe gebruik ik n8n?',
    prijs: 12900,           // €129,00 — placeholder, pas aan
    beschrijving: 'Online cursus: Hoe gebruik ik n8n?',
    pdf: 'hoe-gebruik-ik-n8n.pdf',
  },
  'crm-koppelen-n8n': {
    naam: 'CRM koppelen aan n8n',
    prijs: 17900,           // €179,00 — placeholder, pas aan
    beschrijving: 'Online cursus: CRM koppelen aan n8n',
    pdf: 'crm-koppelen-n8n.pdf',
  },
};
