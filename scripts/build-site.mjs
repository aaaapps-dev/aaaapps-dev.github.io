// Builds the site from apps.json + i18n.json:
//   /index.html (English), /<lang>/index.html, /sitemap.xml, /robots.txt
// The site address comes from the CNAME file (custom domain) when it exists.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const LANGS = JSON.parse(read('scripts/i18n.json'));
const DATA = existsSync(new URL('apps.json', ROOT)) ? JSON.parse(read('apps.json')) : { apps: [] };
const CODES = Object.keys(LANGS);
const EMAIL = 'aaaappsupport@gmail.com';
const DEV_URL = 'https://play.google.com/store/apps/developer?id=AAAAPPS';
const cname = existsSync(new URL('CNAME', ROOT)) ? read('CNAME').trim() : '';
const SITE = cname ? `https://${cname}` : 'https://aaaapps-dev.github.io';
const YEAR = new Date().getFullYear();

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortName = t => String(t).split(/\s[:\-–|]\s?|:\s/)[0].trim();
const pathOf = code => (code === 'en' ? '/' : `/${code}/`);

function appText(app, code) {
  const i = (app.i18n && (app.i18n[code] || app.i18n.en)) || {};
  return {
    title: i.title || app.title || app.id,
    summary: i.summary || app.summary || '',
    genre: i.genre || app.genre || '',
    featureGraphic: i.featureGraphic || app.featureGraphic || ''
  };
}

const ICON = {
  logo: s => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 19 12 5l5 14M9 14h6"/></svg>`,
  play: (s, c = '#fff') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${c}" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>`,
  mail: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14322F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  copy: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#18252A" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  globe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`
};

const iconHtml = (app, t) => app.icon
  ? `<img src="${esc(app.icon)}" alt="${esc(shortName(t.title))} icon" width="64" height="64" loading="lazy">`
  : `<div class="ph icon">${esc(shortName(t.title).charAt(0))}</div>`;
const bannerHtml = (t, lazy = true) => t.featureGraphic
  ? `<img src="${esc(t.featureGraphic)}" alt="${esc(shortName(t.title))}" width="1024" height="500"${lazy ? ' loading="lazy"' : ''}>`
  : `<div class="ph">${esc(shortName(t.title))}</div>`;

const CSS = `
:root{--accent:#1F8A84;--accent-dark:#176E69;--ground:#EEF6F5;--text:#18252A;--muted:#4A5A60;--soft:#5E6E73;--shadow:0 8px 24px rgba(20,60,60,.07)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:Manrope,"IBM Plex Sans Arabic",system-ui,sans-serif;background:var(--ground);color:var(--text);-webkit-font-smoothing:antialiased}
a{color:inherit}img{display:block;max-width:100%}svg{flex:none}
.wrap{max-width:1200px;margin:0 auto;padding:0 28px}
header{position:sticky;top:0;z-index:20;background:rgba(238,246,245,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:12px;height:76px}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800;font-size:20px;letter-spacing:.08em}
.brand{display:flex;flex-direction:column;line-height:1.15}
.tag{font-size:12px;font-weight:600;letter-spacing:0;color:var(--soft);margin-top:3px}
.logo i{width:38px;height:38px;border-radius:11px;background:var(--accent);display:grid;place-items:center}
.right{display:flex;align-items:center;gap:10px}
nav{display:flex;gap:6px;padding:6px;background:#fff;border-radius:999px;box-shadow:var(--shadow)}
nav a{text-decoration:none;font-weight:600;font-size:15px;padding:10px 18px;border-radius:999px;transition:background .2s}
nav a:hover{background:var(--ground)}nav a.on{background:var(--accent);color:#fff}
.menu-btn{display:none;width:44px;height:44px;border:0;border-radius:999px;background:#fff;box-shadow:var(--shadow);align-items:center;justify-content:center;cursor:pointer}
.lang{position:relative}
.lang summary{list-style:none;display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:999px;background:#fff;box-shadow:var(--shadow);cursor:pointer;font-weight:700;font-size:14px;text-transform:uppercase}
.lang summary::-webkit-details-marker{display:none}
.lang ul{position:absolute;inset-inline-end:0;top:52px;margin:0;padding:6px;list-style:none;background:#fff;border-radius:16px;box-shadow:0 14px 34px rgba(20,60,60,.16);min-width:190px;max-height:70vh;overflow:auto}
.lang li a{display:block;padding:10px 14px;border-radius:10px;text-decoration:none;font-size:15px}
.lang li a:hover{background:var(--ground)}.lang li a[aria-current]{font-weight:800;color:var(--accent-dark)}
.play{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;min-height:48px;border-radius:12px;background:#14181F;color:#fff;text-decoration:none;transition:transform .15s}
.play:hover{transform:translateY(-1px)}.play span{display:flex;flex-direction:column;line-height:1.15}
.play small{font-size:10px;letter-spacing:.06em}.play b{font-size:16px;font-weight:600}
.play.sm{padding:8px 14px;min-height:44px}.play.sm b{font-size:14px}
.link{font-weight:700;color:var(--accent-dark);text-decoration:none}.link:hover{text-decoration:underline}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;padding:48px 0 88px}
.hero h1{margin:0;font-size:60px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
.hero p{margin:22px 0 28px;font-size:19px;line-height:1.6;color:var(--muted);max-width:520px}
.cta{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.stat{display:inline-flex;align-items:center;gap:14px;margin-top:28px;padding:14px 22px;background:#fff;border-radius:18px;box-shadow:var(--shadow)}
.stat b{font-size:34px;font-weight:800;color:var(--accent-dark);line-height:1;font-variant-numeric:tabular-nums}
.stat span{display:flex;flex-direction:column;font-weight:700;font-size:15px;line-height:1.3}
.stat small{font-weight:500;font-size:13px;color:var(--soft)}
.icons{display:flex;gap:10px;flex-wrap:wrap;margin-top:32px}
.icons a{width:48px;height:48px;border-radius:13px;overflow:hidden;box-shadow:0 4px 12px rgba(20,60,60,.12);transition:transform .15s}
.icons a:hover{transform:translateY(-2px)}.icons img{width:100%;height:100%}
.stage{position:relative;background:#fff;border-radius:32px;box-shadow:0 20px 50px rgba(20,60,60,.10);aspect-ratio:1.15;display:flex;align-items:center;justify-content:center;overflow:hidden}
.stage .fg{position:absolute;width:72%;aspect-ratio:1024/500;border-radius:18px;overflow:hidden;box-shadow:0 14px 34px rgba(20,40,45,.18);background:var(--ground)}
.stage .fg:nth-child(1){transform:translate(-14%,-38%) rotate(-5deg)}
.stage .fg:nth-child(2){transform:translate(14%,0) rotate(3deg)}
.stage .fg:nth-child(3){transform:translate(-8%,40%) rotate(-2deg)}
.stage .fg img{width:100%;height:100%;object-fit:cover}
section h2{margin:0;font-size:40px;font-weight:800}
.sub{margin:8px 0 0;color:var(--muted);font-size:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:30px}
.card{background:#fff;border-radius:24px;overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column;text-decoration:none;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(20,60,60,.12)}
.card .banner{aspect-ratio:1024/500;background:var(--ground);overflow:hidden}
.card .banner img{width:100%;height:100%;object-fit:cover}
.card .body{padding:0 22px 22px;display:flex;flex-direction:column;gap:10px;flex:1}
.card .ic{width:64px;height:64px;border-radius:16px;overflow:hidden;margin-top:-32px;border:4px solid #fff;background:#fff;box-shadow:0 6px 16px rgba(20,60,60,.14)}
.card .ic img{width:100%;height:100%}
.card h3{margin:4px 0 0;font-size:19px;line-height:1.35}
.card .genre{font-size:13px;font-weight:700;color:var(--accent-dark)}
.card p{margin:0;font-size:15px;line-height:1.55;color:var(--muted)}
.card .foot{margin-top:auto;padding-top:8px}
.ph{width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#DCEFEC,#F4FAF9);color:var(--accent-dark);font-weight:800;font-size:22px;text-align:center;padding:12px}
.ph.icon{font-size:24px;background:var(--accent);color:#fff}
.contact{background:var(--accent);color:#fff;padding:72px 0;margin-top:88px}
.contact .wrap{display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap}
.contact h2{color:#fff;font-size:36px}.contact p{margin:10px 0 0;font-size:17px;opacity:.95}
.mail{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mail a{display:inline-flex;align-items:center;gap:10px;padding:16px 24px;min-height:52px;border-radius:999px;background:#fff;color:#14322F;text-decoration:none;font-weight:700;font-size:17px;direction:ltr}
.mail button{width:52px;height:52px;border-radius:999px;border:1.5px solid rgba(255,255,255,.6);background:transparent;display:grid;place-items:center;cursor:pointer}
.mail button:hover{background:rgba(255,255,255,.12)}
.toast{font-size:14px;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
footer .wrap{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:26px 28px;font-size:14px;color:var(--soft);flex-wrap:wrap}
footer .logo{font-size:16px}footer .logo i{width:28px;height:28px;border-radius:8px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:8px}
[dir=rtl] .hero h1,[dir=rtl] section h2{letter-spacing:0}
@media (max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}.hero h1{font-size:48px}}
@media (max-width:720px){
.tag{font-size:11px;margin-top:2px}.tag span{display:block}
.stat{margin-top:22px;padding:12px 18px}.stat b{font-size:28px}
.wrap{padding:0 18px}.bar{height:auto;min-height:68px;padding:8px 0}.logo{min-width:0}.right{flex:none}
.logo{font-size:17px}.logo i{width:32px;height:32px;border-radius:9px}
.menu-btn{display:flex}
nav{display:none;position:absolute;top:64px;inset-inline-end:18px;flex-direction:column;min-width:170px;border-radius:18px;padding:8px}
nav.open{display:flex}
.lang summary{padding:0 12px}
.hero{grid-template-columns:1fr;gap:30px;padding:18px 0 48px}
.hero h1{font-size:38px}.hero p{font-size:16px;margin:16px 0 22px}
.icons a{width:42px;height:42px;border-radius:11px}
.stage{aspect-ratio:1.05;border-radius:26px}
section h2{font-size:28px}.grid{grid-template-columns:1fr;gap:16px;margin-top:20px}
.contact{padding:44px 0;margin-top:56px}.contact h2{font-size:26px}
.mail a{font-size:15px;padding:14px 18px}
}`;

function page(code) {
  const L = LANGS[code];
  const apps = DATA.apps || [];
  const texts = apps.map(a => appText(a, code));
  const names = texts.map(t => shortName(t.title));
  const desc = L.desc.replace('{apps}', names.join(', '));
  const url = SITE + pathOf(code);
  const total = apps.reduce((n, a) => n + (Number(a.installs) || 0), 0);
  const numLocale = code === 'ar' ? 'ar-u-nu-latn' : code;
  const fmt = n => new Intl.NumberFormat(numLocale).format(n);
  const statHtml = total > 0
    ? `<div class="stat"><b data-count="${total}" data-locale="${numLocale}">${fmt(total)}+</b><span>${esc(L.downloads)}<small>${esc(L.across.replace('{n}', apps.length))}</small></span></div>`
    : '';
  const fontExtra = code === 'ar' ? '&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700' : '';

  const alternates = CODES.map(c => `<link rel="alternate" hreflang="${c}" href="${SITE}${pathOf(c)}">`).join('\n') +
    `\n<link rel="alternate" hreflang="x-default" href="${SITE}/">`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'AAAAPPS', url: `${SITE}/`, email: EMAIL, sameAs: [DEV_URL] },
      { '@type': 'WebSite', url, name: 'AAAAPPS', inLanguage: code, publisher: { '@id': `${SITE}/#org` } },
      {
        '@type': 'ItemList', name: L.appsH2,
        itemListElement: apps.map((a, i) => ({
          '@type': 'ListItem', position: i + 1,
          item: {
            '@type': 'SoftwareApplication', name: texts[i].title, operatingSystem: 'ANDROID',
            applicationCategory: texts[i].genre || undefined, url: a.url, image: a.icon || undefined,
            description: texts[i].summary || undefined, publisher: { '@id': `${SITE}/#org` },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
          }
        }))
      }
    ]
  };

  const langMenu = CODES.map(c =>
    `<li><a href="${pathOf(c)}" hreflang="${c}" lang="${c}" data-lang="${c}"${c === code ? ' aria-current="page"' : ''}>${esc(LANGS[c].name)}</a></li>`).join('');

  const cards = apps.map((a, i) => {
    const t = texts[i];
    return `<a class="card" href="${esc(a.url)}" target="_blank" rel="noopener">
<div class="banner">${bannerHtml(t)}</div>
<div class="body">
<div class="ic">${iconHtml(a, t)}</div>
<div><h3>${esc(t.title)}</h3>${t.genre ? `<span class="genre">${esc(t.genre)}</span>` : ''}</div>
${t.summary ? `<p>${esc(t.summary)}</p>` : ''}
<div class="foot"><span class="play sm">${ICON.play(18)}<span><small>${esc(L.getItOn)}</small><b>Google Play</b></span></span></div>
</div></a>`;
  }).join('\n');

  const heroIcons = apps.map((a, i) =>
    `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="${esc(texts[i].title)}" aria-label="${esc(texts[i].title)}">${iconHtml(a, texts[i])}</a>`).join('');
  const withArt = texts.filter(t => t.featureGraphic);
  const stage = (withArt.length >= 3 ? withArt : texts).slice(0, 3).map(t => `<div class="fg">${bannerHtml(t, false)}</div>`).join('');

  // Root page only: send first-time visitors to their device language.
  const redirect = code === 'en' ? `<script>
(function(){try{var L=${JSON.stringify(CODES)},s=localStorage.getItem('lang');
var l=s||((navigator.languages&&navigator.languages[0])||navigator.language||'en').slice(0,2).toLowerCase();
if(l!=='en'&&L.indexOf(l)>-1){location.replace('/'+l+'/'+location.hash);}}catch(e){}})();
</script>` : '';

  return `<!doctype html>
<html lang="${code}" dir="${L.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${redirect}
<title>${esc(L.title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${alternates}
<meta name="theme-color" content="#1F8A84">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AAAAPPS">
<meta property="og:title" content="${esc(L.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${code}">
${texts[0] && texts[0].featureGraphic ? `<meta property="og:image" content="${esc(texts[0].featureGraphic)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%231F8A84'/%3E%3Cpath d='M7 19 12 5l5 14M9 14h6' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800${fontExtra}&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
<style>${CSS}</style>
</head>
<body>
<header>
<div class="wrap bar">
<a class="logo" href="${pathOf(code)}" aria-label="AAAAPPS"><i>${ICON.logo(22)}</i><span class="brand">AAAAPPS<small class="tag">${L.tagline.split('|').map(x => `<span>${esc(x)}</span>`).join(' ')}</small></span></a>
<div class="right">
<nav id="nav">
<a href="#apps" class="on">${esc(L.navApps)}</a>
<a href="#contact">${esc(L.navContact)}</a>
<a href="${DEV_URL}" target="_blank" rel="noopener">Google Play</a>
</nav>
<details class="lang"><summary aria-label="${esc(L.language)}">${ICON.globe}${code}</summary><ul>${langMenu}</ul></details>
<button class="menu-btn" id="menuBtn" type="button" aria-label="${esc(L.menu)}" aria-expanded="false" aria-controls="nav">${ICON.menu}</button>
</div>
</div>
</header>
<main id="top">
<div class="wrap hero">
<div>
<h1>${esc(L.h1)}</h1>
<p>${esc(L.hero)}</p>
<div class="cta">
<a class="play" href="${DEV_URL}" target="_blank" rel="noopener">${ICON.play(20)}<span><small>${esc(L.getItOn)}</small><b>Google Play</b></span></a>
<a class="link" href="#apps">${esc(L.seeAll)}</a>
</div>
${statHtml}
<div class="icons">${heroIcons}</div>
</div>
<div class="stage" aria-hidden="true">${stage}</div>
</div>
<section id="apps" class="wrap">
<h2>${esc(L.appsH2)}</h2>
<p class="sub">${esc(L.appsSub.replace('{n}', apps.length))}</p>
<div class="grid">
${cards}
</div>
</section>
<section id="contact" class="contact">
<div class="wrap">
<div>
<h2>${esc(L.contactH2)}</h2>
<p>${esc(L.contactP)}</p>
</div>
<div class="mail">
<a href="mailto:${EMAIL}">${ICON.mail}${EMAIL}</a>
<button type="button" id="copyBtn" aria-label="${esc(L.copy)}">${ICON.copy}</button>
<span class="toast" id="toast" role="status">${esc(L.copied)}</span>
</div>
</div>
</section>
</main>
<footer>
<div class="wrap">
<a class="logo" href="${pathOf(code)}"><i>${ICON.logo(16)}</i>AAAAPPS</a>
<span>© ${YEAR} AAAAPPS. ${esc(L.rights)}</span>
</div>
</footer>
<script>
(function(){
var btn=document.getElementById('menuBtn'),nav=document.getElementById('nav');
btn.addEventListener('click',function(){var o=nav.classList.toggle('open');btn.setAttribute('aria-expanded',o);});
nav.addEventListener('click',function(e){if(e.target.tagName==='A'){nav.classList.remove('open');btn.setAttribute('aria-expanded','false');}});
document.querySelectorAll('[data-lang]').forEach(function(a){a.addEventListener('click',function(){try{localStorage.setItem('lang',a.getAttribute('data-lang'));}catch(e){}});});
document.getElementById('copyBtn').addEventListener('click',function(){
var t=document.getElementById('toast'),done=function(){t.classList.add('show');setTimeout(function(){t.classList.remove('show');},1600);};
if(navigator.clipboard){navigator.clipboard.writeText('${EMAIL}').then(done,done);}else{done();}
});
var c=document.querySelector('[data-count]');
if(c&&!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)){
var to=+c.getAttribute('data-count'),f=new Intl.NumberFormat(c.getAttribute('data-locale')),t0=null,dur=1600;
var step=function(t){if(!t0)t0=t;var p=Math.min((t-t0)/dur,1),e=1-Math.pow(1-p,3);c.textContent=f.format(Math.round(to*e))+'+';if(p<1)requestAnimationFrame(step);};
requestAnimationFrame(step);}
document.addEventListener('click',function(e){var d=document.querySelector('.lang');if(d&&d.open&&!d.contains(e.target))d.open=false;});
})();
</script>
</body>
</html>
`;
}

for (const code of CODES) {
  const html = page(code);
  if (code === 'en') writeFileSync(new URL('index.html', ROOT), html);
  else {
    mkdirSync(new URL(`${code}/`, ROOT), { recursive: true });
    writeFileSync(new URL(`${code}/index.html`, ROOT), html);
  }
}

const lastmod = (DATA.updated || new Date().toISOString()).slice(0, 10);
const alts = CODES.map(c => `    <xhtml:link rel="alternate" hreflang="${c}" href="${SITE}${pathOf(c)}"/>`).join('\n');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${CODES.map(c => `  <url>
    <loc>${SITE}${pathOf(c)}</loc>
    <lastmod>${lastmod}</lastmod>
${alts}
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(new URL('sitemap.xml', ROOT), sitemap);
writeFileSync(new URL('robots.txt', ROOT), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${CODES.length} language pages for ${SITE}`);
