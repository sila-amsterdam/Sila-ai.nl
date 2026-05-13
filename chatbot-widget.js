/**
 * Chatbot Widget v2.0 — WhatsApp stijl
 *
 * Gebruik:
 *   <script>
 *     window.ChatbotConfig = {
 *       webhookUrl:     'https://n8n.sila-ai.nl/webhook/chatbot',
 *       companyId:      'company-001',
 *       name:           'Assistent',
 *       color:          null,           // null = auto (#25D366 bij whatsapp mode)
 *       logo:           null,
 *       welcomeMessage: 'Hoe kan ik u helpen?',
 *       language:       'nl',
 *       position:       'bottom-right',
 *       whatsappStyle:  true,           // WhatsApp uiterlijk aan/uit
 *       sound:          true,           // Notificatiegeluid
 *       quickReplies:   null,           // null = standaard, of [{label, action}]
 *       contactInfo: {
 *         email:    'info@sila-ai.nl',
 *         linkedin: 'https://www.linkedin.com/company/sila-ai-nl/'
 *       }
 *     };
 *   </script>
 *   <script src="chatbot-widget.js"></script>
 */

(function () {
  'use strict';

  // =============================================
  // CONFIGURATIE
  // =============================================
  var cfg = Object.assign({
    webhookUrl:     '',
    companyId:      'default',
    name:           'Assistent',
    color:          null,
    logo:           null,
    welcomeMessage: 'Hoe kan ik u helpen?',
    language:       'nl',
    position:       'bottom-right',
    accentDark:     null,
    whatsappStyle:  false,
    sound:          true,
    quickReplies:   null,
    contactInfo:    null
  }, window.ChatbotConfig || {});

  var WA = cfg.whatsappStyle;
  if (!cfg.color) cfg.color = WA ? '#25D366' : '#6366f1';

  // =============================================
  // VERTALINGEN
  // =============================================
  var translations = {
    nl: {
      placeholder:      'Typ een bericht...',
      send:             'Verstuur',
      close:            'Sluiten',
      open:             'Chat openen',
      error:            'Er is een fout opgetreden. Probeer het opnieuw.',
      typing:           'Typt...',
      appointmentBadge: 'Afspraak aangevraagd',
      poweredBy:        'Aangedreven door Sila',
      contactTitle:     'Neem contact op',
      today:            'Vandaag',
      demoLabel:        'Demo aanvragen',
      contactLabel:     'Contact',
      howtoLabel:       'Hoe werkt het?'
    },
    en: {
      placeholder:      'Type a message...',
      send:             'Send',
      close:            'Close',
      open:             'Open chat',
      error:            'An error occurred. Please try again.',
      typing:           'Typing...',
      appointmentBadge: 'Appointment requested',
      poweredBy:        'Powered by Sila',
      contactTitle:     'Get in touch',
      today:            'Today',
      demoLabel:        'Request demo',
      contactLabel:     'Contact',
      howtoLabel:       'How does it work?'
    }
  };
  var t = translations[cfg.language] || translations.nl;

  var defaultQuickReplies = [
    { label: t.demoLabel,    action: 'demo' },
    { label: t.contactLabel, action: 'contact' }
  ];
  var quickReplies = cfg.quickReplies || defaultQuickReplies;

  var contactInfo = cfg.contactInfo || {
    email:    'info@sila-ai.nl',
    linkedin: 'https://www.linkedin.com/company/sila-ai-nl/'
  };

  // =============================================
  // SESSION
  // =============================================
  function getSessionId() {
    var key = 'cb_session_' + cfg.companyId;
    var id = null;
    try { id = localStorage.getItem(key); } catch (e) {}
    if (!id) {
      id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }

  // =============================================
  // KLEUR HULPFUNCTIES
  // =============================================
  function hexToRgb(hex) {
    var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) }
             : { r: 37, g: 211, b: 102 };
  }

  function darkenColor(hex, amt) {
    var c = hexToRgb(hex);
    return 'rgb(' + Math.max(0, c.r - amt) + ',' + Math.max(0, c.g - amt) + ',' + Math.max(0, c.b - amt) + ')';
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  var primary     = cfg.color;
  var primaryDark = cfg.accentDark || darkenColor(primary, 30);
  var primaryLight = rgba(primary, 0.12);
  var isLeft      = cfg.position === 'bottom-left';
  var posKey      = isLeft ? 'left' : 'right';

  // =============================================
  // GELUID (Web Audio API)
  // =============================================
  var audioCtx = null;

  function playSound() {
    if (!cfg.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Twee korte tonen — WhatsApp-achtig ping
      [[1174.66, 0], [1396.91, 0.14]].forEach(function (n) {
        var osc  = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.value = n[0];
        var t0 = audioCtx.currentTime + n[1];
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.2, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.start(t0);
        osc.stop(t0 + 0.13);
      });
    } catch (e) {}
  }

  // =============================================
  // CSS
  // =============================================
  function injectStyles() {
    // Thema variabelen
    var msgsBg        = WA ? '#e5ddd5' : '#ffffff';
    var asstBg        = WA ? '#ffffff' : '#f1f5f9';
    var asstColor     = WA ? '#111b21' : '#1e293b';
    var userBg        = WA ? '#dcf8c6' : primary;
    var userGradient  = WA ? 'none'    : 'linear-gradient(135deg,' + primary + ',' + primaryDark + ')';
    var userColor     = WA ? '#111b21' : '#ffffff';
    var userTimeColor = WA ? '#667781' : 'rgba(255,255,255,0.7)';
    var asstTimeColor = WA ? '#667781' : '#94a3b8';
    var inputBg       = WA ? '#f0f2f5' : '#f8fafc';
    var inputAreaBg   = WA ? '#f0f2f5' : '#ffffff';
    var borderColor   = WA ? '#e9edef' : '#f1f5f9';
    var inputBorder   = WA ? '#e9edef' : '#e2e8f0';
    var bubbleRadius  = WA ? '50%'     : '12px';
    var inputRadius   = WA ? '24px'    : '12px';
    var asstRadius    = WA ? '0 10px 10px 10px' : '16px 16px 16px 4px';
    var userRadius    = WA ? '10px 0 10px 10px' : '16px 16px 4px 16px';
    var shadow        = WA ? '0 1px 2px rgba(0,0,0,0.13)' : 'none';
    var dotBg         = WA ? '#ffffff' : '#86efac';

    var css = [
      /* Reset */
      '.cb-widget{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '.cb-widget *,.cb-widget *::before,.cb-widget *::after{box-sizing:border-box}',

      /* Bubble */
      '.cb-bubble{position:fixed;' + posKey + ':24px;bottom:24px;width:60px;height:60px;border-radius:50%;' +
        'background:linear-gradient(135deg,' + primary + ',' + primaryDark + ');color:#fff;border:none;cursor:pointer;' +
        'box-shadow:0 4px 20px ' + rgba(primary, 0.45) + ',0 2px 8px rgba(0,0,0,.15);' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;z-index:2147483646}',
      '.cb-bubble:hover{transform:scale(1.1);box-shadow:0 8px 32px ' + rgba(primary, 0.55) + ',0 4px 12px rgba(0,0,0,.18)}',
      '.cb-bubble:active{transform:scale(.95)}',
      '.cb-bubble.cb-open svg.cb-icon-chat{display:none}',
      '.cb-bubble:not(.cb-open) svg.cb-icon-close{display:none}',

      /* Badge */
      '.cb-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;' +
        'background:#ef4444;color:#fff;font-size:10px;font-weight:700;font-family:inherit;' +
        'display:none;align-items:center;justify-content:center;border:2px solid #fff}',
      '.cb-badge.cb-visible{display:flex}',

      /* Venster */
      '.cb-window{position:fixed;' + posKey + ':24px;bottom:96px;width:380px;max-width:calc(100vw - 32px);' +
        'height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:20px;' +
        'box-shadow:0 20px 60px rgba(0,0,0,.15),0 4px 16px rgba(0,0,0,.08);' +
        'display:flex;flex-direction:column;overflow:hidden;z-index:2147483645;' +
        'transform:scale(.9) translateY(16px);opacity:0;pointer-events:none;' +
        'transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .2s;' +
        'transform-origin:' + (isLeft ? 'left' : 'right') + ' bottom}',
      '.cb-window.cb-open{transform:scale(1) translateY(0);opacity:1;pointer-events:all}',

      /* Header */
      '.cb-header{background:linear-gradient(135deg,' + primary + ' 0%,' + primaryDark + ' 100%);' +
        'color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0}',
      '.cb-header-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.2);' +
        'display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}',
      '.cb-header-avatar img{width:100%;height:100%;object-fit:cover}',
      '.cb-header-info{flex:1;min-width:0}',
      '.cb-header-name{font-size:15px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cb-header-status{font-size:12px;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:5px;margin-top:2px}',
      '.cb-status-dot{width:7px;height:7px;border-radius:50%;background:' + dotBg + ';flex-shrink:0;animation:cb-pulse 2s infinite}',
      '@keyframes cb-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
      '.cb-header-close{background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;' +
        'border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
        'transition:background .15s;flex-shrink:0}',
      '.cb-header-close:hover{background:rgba(255,255,255,.28)}',

      /* Berichten */
      '.cb-messages{flex:1;overflow-y:auto;padding:12px 10px 8px;display:flex;flex-direction:column;gap:4px;' +
        'scroll-behavior:smooth;background-color:' + msgsBg + ';' +
        (WA ? 'background-image:radial-gradient(circle,rgba(0,0,0,.04) 1px,transparent 1px);background-size:22px 22px' : '') + '}',
      '.cb-messages::-webkit-scrollbar{width:4px}',
      '.cb-messages::-webkit-scrollbar-track{background:transparent}',
      '.cb-messages::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:2px}',

      /* Datum scheiding */
      '.cb-date-sep{text-align:center;margin:6px 0 8px;font-size:11px;color:' + asstTimeColor + '}',
      '.cb-date-sep span{background:' + (WA ? 'rgba(225,245,254,.9)' : 'rgba(241,245,249,.95)') + ';padding:3px 10px;border-radius:8px}',

      /* Berichtbubbels */
      '.cb-msg-wrap{display:flex;align-items:flex-end;gap:6px;animation:cb-slide-in .2s ease;max-width:100%}',
      '.cb-msg-wrap.cb-user{flex-direction:row-reverse}',
      '@keyframes cb-slide-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',

      '.cb-msg-avatar{width:28px;height:28px;border-radius:50%;flex-shrink:0;background:' + primaryLight + ';' +
        'display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:2px}',
      '.cb-msg-avatar img{width:100%;height:100%;object-fit:cover}',
      '.cb-msg-avatar svg{color:' + primary + '}',

      '.cb-msg{max-width:80%;padding:8px 12px 5px;font-size:14px;line-height:1.5;' +
        'word-wrap:break-word;word-break:break-word;overflow-wrap:anywhere;position:relative}',
      '.cb-msg a{color:' + primary + ';text-decoration:underline;word-break:break-all;display:inline-block;max-width:100%}',
      '.cb-msg-user a{color:' + (WA ? '#075e54' : 'rgba(255,255,255,0.9)') + '}',
      '.cb-msg-assistant{background:' + asstBg + ';color:' + asstColor + ';border-radius:' + asstRadius + ';box-shadow:' + shadow + '}',
      '.cb-msg-user{background:' + userBg + ';background:' + userGradient + ';color:' + userColor + ';border-radius:' + userRadius + ';box-shadow:' + shadow + '}',

      /* Bericht footer (tijd + receipts) */
      '.cb-msg-footer{display:flex;align-items:center;justify-content:flex-end;gap:3px;margin-top:3px}',
      '.cb-msg-time{font-size:10px;color:' + asstTimeColor + '}',
      '.cb-msg-user .cb-msg-time{color:' + userTimeColor + '}',

      /* Read receipts */
      '.cb-receipt{font-size:11px;letter-spacing:-3px;color:#667781;line-height:1;margin-left:1px}',
      '.cb-receipt.cb-read{color:#53bdeb}',

      /* Typing indicator */
      '.cb-typing{display:flex;gap:4px;align-items:center;padding:10px 14px;background:' + asstBg + ';' +
        'border-radius:' + asstRadius + ';width:fit-content;box-shadow:' + shadow + '}',
      '.cb-typing span{width:7px;height:7px;border-radius:50%;background:#94a3b8;display:block;animation:cb-bounce 1.2s infinite}',
      '.cb-typing span:nth-child(2){animation-delay:.2s}',
      '.cb-typing span:nth-child(3){animation-delay:.4s}',
      '@keyframes cb-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}',

      /* Afspraak badge */
      '.cb-appointment-badge{display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#15803d;' +
        'font-size:11px;font-weight:500;padding:3px 8px;border-radius:99px;margin-top:6px}',

      /* Quick replies */
      '.cb-quick-replies{display:flex;flex-wrap:wrap;gap:8px;padding:6px 10px 6px;animation:cb-slide-in .3s ease}',
      '.cb-qr-btn{background:#fff;border:1.5px solid ' + primary + ';color:' + primary + ';' +
        'border-radius:20px;padding:7px 15px;font-size:13px;font-weight:500;font-family:inherit;' +
        'cursor:pointer;transition:all .15s;white-space:nowrap}',
      '.cb-qr-btn:hover{background:' + primary + ';color:#fff;transform:translateY(-1px);' +
        'box-shadow:0 2px 8px ' + rgba(primary, 0.3) + '}',
      '.cb-qr-btn:active{transform:translateY(0)}',

      /* Contact kaart */
      '.cb-contact-card{background:' + (WA ? '#f9fafb' : '#f8fafc') + ';border:1px solid ' + inputBorder + ';' +
        'border-radius:10px;padding:12px 14px;margin-top:6px;font-size:13px}',
      '.cb-contact-card-title{font-weight:600;color:' + asstColor + ';margin-bottom:8px;font-size:13px}',
      '.cb-contact-card a{color:' + primary + ';text-decoration:none;font-weight:500;' +
        'display:flex;align-items:center;gap:7px;padding:5px 0;transition:opacity .15s}',
      '.cb-contact-card a:hover{opacity:.75;text-decoration:underline}',

      /* Input area */
      '.cb-input-area{padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));' +
        'border-top:1px solid ' + borderColor + ';display:flex;gap:8px;align-items:flex-end;' +
        'flex-shrink:0;background:' + inputAreaBg + '}',
      '.cb-input{flex:1;border:1.5px solid ' + inputBorder + ';border-radius:' + inputRadius + ';' +
        'padding:10px 14px;font-size:14px;font-family:inherit;color:' + asstColor + ';' +
        'outline:none;resize:none;min-height:44px;max-height:120px;line-height:1.5;' +
        'transition:border-color .15s;overflow-y:auto;background:' + inputBg + '}',
      '.cb-input:focus{border-color:' + primary + ';background:#fff}',
      '.cb-input::placeholder{color:#94a3b8}',
      '.cb-input:disabled{opacity:.6;cursor:not-allowed}',
      '.cb-send{width:44px;height:44px;border-radius:' + bubbleRadius + ';flex-shrink:0;' +
        'background:linear-gradient(135deg,' + primary + ',' + primaryDark + ');color:#fff;border:none;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;transition:opacity .15s,transform .15s;' +
        'box-shadow:0 2px 8px ' + rgba(primary, 0.35) + '}',
      '.cb-send:hover:not(:disabled){opacity:.88;transform:scale(1.05)}',
      '.cb-send:active:not(:disabled){transform:scale(.95)}',
      '.cb-send:disabled{opacity:.4;cursor:not-allowed;transform:none}',

      /* Footer */
      '.cb-footer{text-align:center;padding:4px 0 8px;font-size:10px;color:#cbd5e1;flex-shrink:0;background:' + inputAreaBg + '}',

      /* Mobiel */
      '@media(max-width:480px){',
      '  .cb-window{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:0!important;' +
        'width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;' +
        'border-radius:0!important;transform-origin:bottom center!important}',
      '  .cb-header{padding-top:max(14px,env(safe-area-inset-top,14px))!important}',
      '  .cb-input-area{padding-bottom:max(12px,env(safe-area-inset-bottom,12px))!important}',
      '  .cb-bubble{' + posKey + ':16px!important;bottom:16px!important}',
      '}'
    ].join('\n');

    var s = document.createElement('style');
    s.id = 'cb-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // =============================================
  // ICONEN
  // =============================================
  var waIcon = '<svg class="cb-icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
    '</svg>';

  var chatIcon = '<svg class="cb-icon-chat" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

  var icons = {
    chat:     WA ? waIcon : chatIcon,
    close:    '<svg class="cb-icon-close" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    send:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    bot:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.38-1 1.72V7h1a7 7 0 017 7H4a7 7 0 017-7h1V5.72A2 2 0 0112 2zM7 14v2a1 1 0 002 0v-2H7zm6 0v2a1 1 0 002 0v-2h-2zM5 21a1 1 0 01-1-1v-1h16v1a1 1 0 01-1 1H5z"/></svg>',
    calendar: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>',
    email:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    linkedin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
  };

  // =============================================
  // DOM
  // =============================================
  var bubble, chatWindow, messagesList, inputField, sendBtn, quickRepliesEl;
  var sessionId = getSessionId();
  var isLoading = false;
  var qrDismissed = false;

  function buildWidget() {
    bubble = document.createElement('button');
    bubble.className = 'cb-widget cb-bubble';
    bubble.setAttribute('aria-label', t.open);
    bubble.setAttribute('aria-expanded', 'false');
    bubble.innerHTML = icons.chat + icons.close +
      '<span class="cb-badge" id="cb-badge" aria-live="polite"></span>';

    chatWindow = document.createElement('div');
    chatWindow.className = 'cb-widget cb-window';
    chatWindow.setAttribute('role', 'dialog');
    chatWindow.setAttribute('aria-label', cfg.name);
    chatWindow.setAttribute('aria-modal', 'true');

    var avatarHtml = cfg.logo
      ? '<img src="' + cfg.logo + '" alt="' + cfg.name + '" />'
      : icons.bot;

    chatWindow.innerHTML = [
      '<div class="cb-header">',
      '  <div class="cb-header-avatar">' + avatarHtml + '</div>',
      '  <div class="cb-header-info">',
      '    <div class="cb-header-name">' + escapeHtml(cfg.name) + '</div>',
      '    <div class="cb-header-status"><span class="cb-status-dot"></span>Online</div>',
      '  </div>',
      '  <button class="cb-header-close" aria-label="' + t.close + '">',
      '    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
      '  </button>',
      '</div>',
      '<div class="cb-messages" id="cb-messages-list" aria-live="polite" aria-label="Berichten"></div>',
      '<div class="cb-input-area">',
      '  <textarea class="cb-input" id="cb-input-field" placeholder="' + t.placeholder + '" rows="1" aria-label="' + t.placeholder + '"></textarea>',
      '  <button class="cb-send" id="cb-send-btn" aria-label="' + t.send + '">' + icons.send + '</button>',
      '</div>',
      '<div class="cb-footer">' + t.poweredBy + '</div>'
    ].join('');

    document.body.appendChild(bubble);
    document.body.appendChild(chatWindow);

    messagesList = document.getElementById('cb-messages-list');
    inputField   = document.getElementById('cb-input-field');
    sendBtn      = document.getElementById('cb-send-btn');

    bubble.addEventListener('click', toggleChat);
    chatWindow.querySelector('.cb-header-close').addEventListener('click', closeChat);
    sendBtn.addEventListener('click', sendMessage);

    inputField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputField.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    inputField.addEventListener('focus', function () {
      setTimeout(scrollToBottom, 300);
    });

    document.addEventListener('click', function (e) {
      if (chatWindow.classList.contains('cb-open') &&
          !chatWindow.contains(e.target) && !bubble.contains(e.target)) {
        closeChat();
      }
    });

    setupViewport();

    appendDateSeparator();
    appendMessage('assistant', cfg.welcomeMessage);
    if (quickReplies.length > 0) setTimeout(renderQuickReplies, 700);
  }

  // =============================================
  // QUICK REPLIES
  // =============================================
  function renderQuickReplies() {
    if (qrDismissed) return;
    if (quickRepliesEl) quickRepliesEl.remove();

    quickRepliesEl = document.createElement('div');
    quickRepliesEl.className = 'cb-widget cb-quick-replies';

    quickReplies.forEach(function (qr) {
      var btn = document.createElement('button');
      btn.className = 'cb-widget cb-qr-btn';
      btn.textContent = qr.label;
      btn.addEventListener('click', function (e) { e.stopPropagation(); handleQuickReply(qr); });
      quickRepliesEl.appendChild(btn);
    });

    messagesList.appendChild(quickRepliesEl);
    scrollToBottom();
  }

  function dismissQuickReplies() {
    if (quickRepliesEl) { quickRepliesEl.remove(); quickRepliesEl = null; }
    qrDismissed = true;
  }

  function handleQuickReply(qr) {
    dismissQuickReplies();
    if (qr.action === 'contact') {
      appendMessage('user', qr.label);
      showContactResponse();
    } else if (typeof qr.onSelect === 'function') {
      qr.onSelect(qr);
    } else {
      inputField.value = qr.label;
      sendMessage();
    }
  }

  function showContactResponse() {
    setLoading(true);
    var typingWrap = showTyping();

    setTimeout(function () {
      typingWrap.remove();

      var wrap = document.createElement('div');
      wrap.className = 'cb-msg-wrap';

      var avatarHtml = '<div class="cb-msg-avatar">' +
        (cfg.logo ? '<img src="' + cfg.logo + '" alt="" />' : icons.bot) + '</div>';

      var liHtml = contactInfo.linkedin
        ? '<a href="' + contactInfo.linkedin + '" target="_blank" rel="noopener noreferrer">' +
          icons.linkedin + ' LinkedIn: Sila AI</a>'
        : '';

      var cardHtml = '<div class="cb-msg cb-msg-assistant">' +
        '<span>Je kunt ons bereiken via:</span>' +
        '<div class="cb-contact-card">' +
        '<div class="cb-contact-card-title">' + escapeHtml(t.contactTitle) + '</div>' +
        '<a href="mailto:' + contactInfo.email + '">' + icons.email + ' ' + escapeHtml(contactInfo.email) + '</a>' +
        liHtml +
        '</div>' +
        '<div class="cb-msg-footer"><span class="cb-msg-time">' + formatTime() + '</span></div>' +
        '</div>';

      wrap.innerHTML = avatarHtml + cardHtml;
      messagesList.appendChild(wrap);
      playSound();
      scrollToBottom();
      setLoading(false);
    }, 1000);
  }

  // =============================================
  // VIEWPORT (mobiel toetsenbord)
  // =============================================
  function setupViewport() {
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVpResize);
      window.visualViewport.addEventListener('scroll', onVpResize);
    } else {
      window.addEventListener('resize', onWinResize);
    }
  }

  function onVpResize() {
    if (!chatWindow.classList.contains('cb-open') || window.innerWidth > 480) return;
    var vv = window.visualViewport;
    chatWindow.style.top    = vv.offsetTop + 'px';
    chatWindow.style.height = vv.height + 'px';
    chatWindow.style.bottom = 'auto';
    scrollToBottom();
  }

  function onWinResize() {
    if (!chatWindow.classList.contains('cb-open') || window.innerWidth > 480) return;
    chatWindow.style.height = window.innerHeight + 'px';
    scrollToBottom();
  }

  function resetViewport() {
    chatWindow.style.top    = '';
    chatWindow.style.height = '';
    chatWindow.style.bottom = '';
  }

  // =============================================
  // OPENEN / SLUITEN
  // =============================================
  function toggleChat() {
    chatWindow.classList.contains('cb-open') ? closeChat() : openChat();
  }

  function openChat() {
    chatWindow.classList.add('cb-open');
    bubble.classList.add('cb-open');
    bubble.setAttribute('aria-expanded', 'true');
    hideBadge();
    if (window.innerWidth <= 480) document.body.style.overflow = 'hidden';
    setTimeout(function () { inputField.focus(); scrollToBottom(); }, 300);
  }

  function closeChat() {
    chatWindow.classList.remove('cb-open');
    bubble.classList.remove('cb-open');
    bubble.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    resetViewport();
  }

  function showBadge() {
    var badge = document.getElementById('cb-badge');
    if (badge && !chatWindow.classList.contains('cb-open')) {
      badge.textContent = '1';
      badge.classList.add('cb-visible');
    }
  }

  function hideBadge() {
    var badge = document.getElementById('cb-badge');
    if (badge) { badge.textContent = ''; badge.classList.remove('cb-visible'); }
  }

  // =============================================
  // BERICHTEN
  // =============================================
  function formatTime() {
    var n = new Date();
    return ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2);
  }

  function appendDateSeparator() {
    var sep = document.createElement('div');
    sep.className = 'cb-widget cb-date-sep';
    sep.innerHTML = '<span>' + t.today + '</span>';
    messagesList.appendChild(sep);
  }

  function appendMessage(role, content, options) {
    options = options || {};
    var wrap = document.createElement('div');
    wrap.className = 'cb-msg-wrap' + (role === 'user' ? ' cb-user' : '');

    var avatarHtml = role === 'assistant'
      ? '<div class="cb-msg-avatar">' + (cfg.logo ? '<img src="' + cfg.logo + '" alt="" />' : icons.bot) + '</div>'
      : '';

    var badgeHtml = options.appointmentBooked
      ? '<div class="cb-appointment-badge">' + icons.calendar + ' ' + t.appointmentBadge + '</div>'
      : '';

    var receiptId = 'cb-r-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    var receiptHtml = (role === 'user' && WA)
      ? '<span class="cb-receipt cb-delivered" id="' + receiptId + '">✓✓</span>'
      : '';

    var footerHtml = '<div class="cb-msg-footer">' +
      '<span class="cb-msg-time">' + formatTime() + '</span>' + receiptHtml + '</div>';

    wrap.innerHTML = avatarHtml +
      '<div class="cb-msg cb-msg-' + role + '">' +
        '<span>' + renderContent(content) + '</span>' +
        badgeHtml + footerHtml +
      '</div>';

    messagesList.appendChild(wrap);
    scrollToBottom();

    // Gelezen markering na korte vertraging
    if (role === 'user' && WA) {
      setTimeout(function () {
        var el = document.getElementById(receiptId);
        if (el) { el.classList.remove('cb-delivered'); el.classList.add('cb-read'); }
      }, 1500 + Math.random() * 800);
    }

    return wrap;
  }

  function showTyping() {
    var wrap = document.createElement('div');
    wrap.className = 'cb-msg-wrap';
    wrap.id = 'cb-typing-indicator';
    wrap.innerHTML =
      '<div class="cb-msg-avatar">' + (cfg.logo ? '<img src="' + cfg.logo + '" alt="" />' : icons.bot) + '</div>' +
      '<div class="cb-typing"><span></span><span></span><span></span></div>';
    messagesList.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function removeTyping() {
    var el = document.getElementById('cb-typing-indicator');
    if (el) el.remove();
  }

  function scrollToBottom() {
    if (messagesList) messagesList.scrollTop = messagesList.scrollHeight;
  }

  function setLoading(state) {
    isLoading = state;
    if (sendBtn)     sendBtn.disabled     = state;
    if (inputField)  inputField.disabled  = state;
  }

  // =============================================
  // BERICHT VERSTUREN
  // =============================================
  function sendMessage() {
    if (isLoading) return;
    var message = (inputField.value || '').trim();
    if (!message) return;

    dismissQuickReplies();
    inputField.value = '';
    inputField.style.height = 'auto';
    appendMessage('user', message);
    setLoading(true);
    showTyping();

    fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, message: message, companyId: cfg.companyId, lang: cfg.language })
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var ct = res.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) {
        return res.json().then(function (data) {
          return {
            text: data.answer || data.response || data.output || data.text || data.message || '',
            appointmentBooked: data.appointmentBooked === true
          };
        });
      }
      return res.text().then(function (text) { return { text: text, appointmentBooked: false }; });
    })
    .then(function (result) {
      removeTyping();
      appendMessage('assistant', result.text || t.error, { appointmentBooked: result.appointmentBooked });
      playSound();
      if (!chatWindow.classList.contains('cb-open')) showBadge();
    })
    .catch(function (err) {
      console.warn('[Chatbot Widget] fout:', err);
      removeTyping();
      appendMessage('assistant', t.error);
    })
    .finally(function () {
      setLoading(false);
      scrollToBottom();
    });
  }

  // =============================================
  // HULPFUNCTIES
  // =============================================
  function escapeHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
  }

  // Converteert markdown-achtige tekst naar veilige HTML
  function renderContent(str) {
    var escaped = escapeHtml(str);

    // **bold** → <strong>
    escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // *italic* → <em> (enkelvoudige sterretjes die over zijn)
    escaped = escaped.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    // Genummerde lijstregels (1. ... 2. ...) met inspringing
    escaped = escaped.replace(/(^|\n)(\d+)\.\s+/g, '$1<br><span style="display:inline-block;min-width:18px;font-weight:600">$2.</span> ');

    // Newlines → <br> (overige)
    escaped = escaped.replace(/\n/g, '<br>');

    // Dubbele <br> die ontstaan door de lijstvervanging opruimen
    escaped = escaped.replace(/^<br>/, '');

    // URLs → klikbare links
    escaped = escaped.replace(/(https?:\/\/[^\s<>"']+)/g, function (url) {
      var trail = '';
      var m = url.match(/^(.*?)([.,;:!?)\]]+)$/);
      if (m) { url = m[1]; trail = m[2]; }
      var label = url.length > 40 ? url.slice(0, 37) + '…' : url;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' + escapeHtml(trail);
    });

    return escaped;
  }

  // =============================================
  // INIT
  // =============================================
  function init() {
    if (!cfg.webhookUrl) { console.warn('[Chatbot Widget] webhookUrl ontbreekt.'); return; }
    if (document.getElementById('cb-styles')) return;
    injectStyles();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
