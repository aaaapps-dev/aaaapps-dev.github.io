// Reads the AAAAPPS developer page on Google Play (in every site language)
// and updates apps.json. Runs daily from .github/workflows/update-apps.yml.
// If Google Play can't be read, apps.json is left as it is.
import gplay from 'google-play-scraper';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DEV_ID = 'AAAAPPS';
const FILE = new URL('../apps.json', import.meta.url);
const LANGS = JSON.parse(readFileSync(new URL('./i18n.json', import.meta.url), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { apps: [] };
const oldById = Object.fromEntries((old.apps || []).map(a => [a.id, a]));

async function details(appId, hl) {
  for (let i = 0; i < 2; i++) {
    try { return await gplay.app({ appId, lang: hl, country: 'us' }); }
    catch (e) { if (i === 1) console.error(`  ${appId} [${hl}] failed: ${e.message}`); await sleep(1500); }
  }
  return null;
}

async function main() {
  let list;
  try {
    list = await gplay.developer({ devId: DEV_ID, num: 100, lang: 'en', country: 'us' });
  } catch (e) {
    console.error('Could not read developer page:', e.message);
    return;
  }
  if (!Array.isArray(list) || list.length === 0) {
    console.error('Developer page returned no apps; keeping current apps.json.');
    return;
  }

  const apps = [];
  for (const item of list) {
    const prev = oldById[item.appId] || {};
    const prevI18n = prev.i18n || {};
    const i18n = {};
    let icon = prev.icon || item.icon || '';
    let installs = prev.installs || 0;
    let url = `https://play.google.com/store/apps/details?id=${item.appId}`;

    for (const [code, L] of Object.entries(LANGS)) {
      const d = await details(item.appId, L.play);
      await sleep(250);
      const p = prevI18n[code] || (code === 'en' ? prev : {});
      i18n[code] = {
        title: (d && d.title) || p.title || item.title || item.appId,
        summary: (d && d.summary) || p.summary || '',
        genre: (d && d.genre) || p.genre || '',
        featureGraphic: (d && d.headerImage) || p.featureGraphic || ''
      };
      if (code === 'en' && d && d.icon) icon = d.icon;
      if (code === 'en' && d) installs = d.maxInstalls || d.minInstalls || installs;
    }
    const en = i18n.en;
    apps.push({
      id: item.appId, url, icon, installs,
      // English fields kept at top level for compatibility
      title: en.title, summary: en.summary, genre: en.genre, featureGraphic: en.featureGraphic,
      i18n
    });
    console.log(`✓ ${item.appId}`);
  }

  if (JSON.stringify(apps) === JSON.stringify(old.apps)) {
    console.log('No changes.');
    return;
  }
  const out = {
    developer: 'AAAAPPS',
    developerUrl: `https://play.google.com/store/apps/developer?id=${DEV_ID}`,
    updated: new Date().toISOString(),
    apps
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`apps.json updated: ${apps.length} apps × ${Object.keys(LANGS).length} languages.`);
}

main();
