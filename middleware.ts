import { next, waitUntil } from '@vercel/functions';

// Logt bezoeken van AI-crawlers, scrapers en mensen die via een LLM binnenkomen
// naar de n8n-webhook "Sila: LLM-verkeer logger" (sheet "Sila LLM-verkeer").
// Geen IP-adres, geen cookies. Faalt altijd stil: logging mag de site nooit vertragen of breken.
// Vercel-env vars: LLM_LOG_WEBHOOK_URL en LLM_LOG_WEBHOOK_SECRET (waarden staan in Sleutels/.env).

type Soort = 'crawler' | 'llm-bezoeker' | 'onbekende-bot';

// Bekende AI-bots. Specifiekste patroon eerst.
const AI_BOTS: Array<[RegExp, string]> = [
  [/OAI-SearchBot/i, 'OpenAI OAI-SearchBot (zoekindex)'],
  [/ChatGPT-User/i, 'OpenAI ChatGPT-User (live vraag)'],
  [/GPTBot/i, 'OpenAI GPTBot (training)'],
  [/Claude-SearchBot/i, 'Anthropic Claude-SearchBot (zoekindex)'],
  [/Claude-User/i, 'Anthropic Claude-User (live vraag)'],
  [/ClaudeBot/i, 'Anthropic ClaudeBot (training)'],
  [/Claude-Web|anthropic-ai/i, 'Anthropic (oude crawler)'],
  [/Perplexity-User/i, 'Perplexity-User (live vraag)'],
  [/PerplexityBot/i, 'PerplexityBot (zoekindex)'],
  [/MistralAI-User/i, 'Mistral MistralAI-User (live vraag)'],
  [/DuckAssistBot/i, 'DuckDuckGo DuckAssistBot'],
  [/GoogleOther|Google-CloudVertexBot/i, 'Google (AI/overig)'],
  [/Applebot/i, 'Apple Applebot'],
  [/Amazonbot/i, 'Amazon Amazonbot'],
  [/meta-externalagent|meta-externalfetcher|FacebookBot/i, 'Meta AI-crawler'],
  [/Bytespider/i, 'ByteDance Bytespider'],
  [/CCBot/i, 'Common Crawl CCBot'],
  [/cohere-ai|cohere-training-data-crawler/i, 'Cohere'],
  [/YouBot/i, 'You.com YouBot'],
  [/Diffbot/i, 'Diffbot'],
  [/ImagesiftBot|Omgilibot|Timpibot/i, 'Overige AI-scraper'],
];

// Bots die geen LLM- of scraperverkeer zijn: zoekmachines, linkpreviews, monitoring, SEO-tools.
const NEGEREN =
  /Googlebot|Google-InspectionTool|AdsBot-Google|Mediapartners|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Slurp|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterestbot|UptimeRobot|Pingdom|StatusCake|BetterUptime|Vercel|AhrefsBot|SemrushBot|MJ12bot|DotBot|PetalBot|Screaming Frog|Lighthouse|PageSpeed|GTmetrix/i;

// Algemene scrapers/automatisering die zich niet als AI-bot melden.
const SCRAPERS: Array<[RegExp, string]> = [
  [/python-requests|python-urllib|aiohttp|httpx/i, 'Python-script'],
  [/Scrapy/i, 'Scrapy'],
  [/^curl\//i, 'curl'],
  [/^Wget/i, 'Wget'],
  [/Go-http-client/i, 'Go-script'],
  [/node-fetch|axios|undici/i, 'Node-script'],
  [/okhttp|Apache-HttpClient|^Java\/|libwww-perl/i, 'HTTP-bibliotheek'],
  [/HeadlessChrome|Puppeteer|Playwright|PhantomJS|Selenium/i, 'Headless browser'],
  [/Firecrawl|Crawl4AI/i, 'Scraper-dienst'],
  [/\b(bot|spider|crawler|scraper)\b/i, 'Onbekende bot (user-agent)'],
];

// Hosts waarvandaan een mens via een LLM doorklikt, en utm_source-waarden die LLM's zelf toevoegen.
const LLM_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'claude.ai',
  'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'you.com',
  'phind.com', 'poe.com', 'chat.mistral.ai', 'grok.com', 'meta.ai',
  'chat.deepseek.com', 'deepseek.com',
];
const LLM_UTM = /chatgpt|openai|perplexity|claude|gemini|copilot|grok|mistral|deepseek|phind|you\.com/i;

// Alleen pagina's en tekstbestanden (llms.txt, sitemap.xml). Sluit scans op .php, .env, .git en assets uit.
const LOGBAAR_PAD = /^[^.]*(?:\.(?:html?|txt|xml|md|json|pdf))?$/i;

function hostMatch(referrer: string): string {
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return LLM_HOSTS.find((h) => host === h || host.endsWith('.' + h)) ?? '';
  } catch {
    return '';
  }
}

function classificeer(ua: string, referrer: string, utm: string): { soort: Soort; bron: string } | null {
  for (const [patroon, label] of AI_BOTS) if (patroon.test(ua)) return { soort: 'crawler', bron: label };
  if (NEGEREN.test(ua)) return null;
  if (ua === '') return { soort: 'onbekende-bot', bron: 'Geen user-agent' };
  for (const [patroon, label] of SCRAPERS) if (patroon.test(ua)) return { soort: 'onbekende-bot', bron: label };
  const host = hostMatch(referrer);
  if (host) return { soort: 'llm-bezoeker', bron: host };
  if (utm && LLM_UTM.test(utm)) return { soort: 'llm-bezoeker', bron: 'utm: ' + utm };
  return null;
}

export default function middleware(request: Request) {
  try {
    const url = new URL(request.url);
    const logUrl = process.env.LLM_LOG_WEBHOOK_URL;
    const secret = process.env.LLM_LOG_WEBHOOK_SECRET;
    if (logUrl && secret && (request.method === 'GET' || request.method === 'HEAD') && LOGBAAR_PAD.test(url.pathname)) {
      const ua = request.headers.get('user-agent') ?? '';
      const referrer = request.headers.get('referer') ?? '';
      const utm = url.searchParams.get('utm_source') ?? '';
      const hit = classificeer(ua, referrer, utm);
      if (hit) {
        const mens = hit.soort === 'llm-bezoeker';
        waitUntil(
          fetch(logUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-sila-token': secret },
            body: JSON.stringify({
              ts: new Date().toISOString(),
              soort: hit.soort,
              bron: hit.bron,
              pad: url.pathname,
              query: url.search,
              referrer: mens ? referrer : '',
              utm_source: utm,
              land: request.headers.get('x-vercel-ip-country') ?? '',
              user_agent: mens ? '' : ua, // bij mensen geen user-agent bewaren
              methode: request.method,
            }),
            signal: AbortSignal.timeout(5000),
          }).catch((err) => console.error('llm-log: versturen mislukt', err?.name)),
        );
      }
    }
  } catch (err) {
    console.error('llm-log: fout', (err as Error)?.name);
  }
  return next();
}

export const config = {
  // Geen assets en afbeeldingen: scheelt aanroepen op het gratis Vercel-plan.
  matcher: '/((?!assets/|brand_assets/|.*\\.(?:png|jpe?g|webp|gif|svg|ico|css|js|mjs|woff2?|ttf|otf|mp4|webm|map)$).*)',
};
