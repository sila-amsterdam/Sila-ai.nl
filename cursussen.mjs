// cursussen.mjs — Centrale autoriteit voor cursusdata en prijzen
// Prijzen in eurocenten. Pas hier aan — NOOIT in de frontend.
// pdf: bestandsnaam in de pdf-cursussen/ map (of null als nog niet beschikbaar)

export const CURSUSSEN = {
  // ── Workshops (op aanvraag — geen directe betaling) ──────────────────────
  'ai-basics-ondernemers': {
    naam: 'AI Basics voor Ondernemers',
    prijs: null,            // Workshop — op aanvraag
    beschrijving: null,
    pdf: 'ai-basics-ondernemers.pdf',
  },
  'chatgpt-masterclass': {
    naam: 'ChatGPT Masterclass',
    prijs: null,            // Workshop — op aanvraag
    beschrijving: null,
    pdf: 'chatgpt-masterclass.pdf',
  },
  'ai-workshop-locatie': {
    naam: 'AI Workshop op Locatie',
    prijs: null,            // Op aanvraag — geen directe betaling
    beschrijving: null,
    pdf: null,
  },

  // ── Online cursussen ─────────────────────────────────────────────────────
  'starten-met-automatiseren': {
    naam: 'Hoe begin ik met automatiseren?',
    prijs: 2500,            // €25,00
    beschrijving: 'Online cursus: Hoe begin ik met automatiseren?',
    pdf: 'starten-met-automatiseren.pdf',
  },
  'ai-tools-vandaag': {
    naam: 'Welke AI tools zijn vandaag nodig?',
    prijs: 1000,            // €10,00
    beschrijving: 'Online cursus: Welke AI tools zijn vandaag nodig? (up to date april 2026)',
    pdf: 'ai-tools-vandaag.pdf',
  },
  'word-een-prompt-expert': {
    naam: 'Word een prompt expert',
    prijs: 2000,            // €20,00
    beschrijving: 'Online cursus: Word een prompt expert',
    pdf: null,
  },
  'hoe-gebruik-ik-n8n': {
    naam: 'Hoe gebruik ik n8n?',
    prijs: 3500,            // €35,00
    beschrijving: 'Online cursus: Hoe gebruik ik n8n?',
    pdf: 'hoe-gebruik-ik-n8n.pdf',
  },
  'hoe-gebruik-ik-claude-code': {
    naam: 'Hoe gebruik ik Claude Code?',
    prijs: 3500,            // €35,00
    beschrijving: 'Online cursus: Hoe gebruik ik Claude Code?',
    pdf: null,
  },

  // ── Kant-en-klare workflows (implementatie.html) ─────────────────────────
  'chatbot-workflow': {
    naam: 'Chatbot Workflow',
    prijs: 5000,            // €50,00
    beschrijving: 'Kant-en-klare workflow: de volledige achterkant van een professionele chatbot in n8n',
    pdf: null,
  },
  'nieuwsbrieven-automatisering': {
    naam: 'Geautomatiseerd nieuwsbrieven maken',
    prijs: 2000,            // €20,00
    beschrijving: 'Kant-en-klare workflow: automatisch nieuwsbrieven genereren op basis van jouw huisstijl',
    pdf: null,
  },
  'ai-nieuws-google-sheet': {
    naam: 'AI nieuws opslaan in Google Sheet',
    prijs: 2000,            // €20,00
    beschrijving: 'Kant-en-klare workflow: AI nieuws vanuit Gmail automatisch opslaan in Google Sheet',
    pdf: null,
  },
};
