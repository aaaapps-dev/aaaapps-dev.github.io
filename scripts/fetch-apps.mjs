// Reads the AAAAPPS developer page on Google Play and updates apps.json.
// Runs daily from .github/workflows/update-apps.yml.
// If Google Play can't be read, apps.json is left as it is.
import gplay from 'google-play-scraper';
import { readFileSync, writeFileSync } from 'node:fs';

const DEV_ID = 'AAAAPPS';
const FILE = new URL('../apps.json', import.meta.url);
const OPTS = { lang: 'en', country: 'us' };

const old = JSON.parse(readFileSync(FILE, 'utf8'));
const oldById = Object.fromEntries((old.apps || []).map(a => [a.id, a]));

async function main() {
  let list;
  try {
    list = await gplay.developer({ devId: DEV_ID, num: 100, ...OPTS });
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
    let d = {};
    try {
      d = await gplay.app({ appId: item.appId, ...OPTS });
    } catch (e) {
      console.error(`Details failed for ${item.appId}: ${e.message}`);
    }
    apps.push({
      id: item.appId,
      title: d.title || item.title || prev.title || item.appId,
      genre: d.genre || prev.genre || '',
      summary: d.summary || item.summary || prev.summary || '',
      icon: d.icon || item.icon || prev.icon || '',
      featureGraphic: d.headerImage || prev.featureGraphic || '',
      url: d.url || item.url || `https://play.google.com/store/apps/details?id=${item.appId}`
    });
  }

  if (JSON.stringify(apps) === JSON.stringify(old.apps)) {
    console.log('No changes.');
    return;
  }
  const out = { ...old, updated: new Date().toISOString(), apps };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n');
  console.log(`apps.json updated: ${apps.length} apps.`);
}

main();
