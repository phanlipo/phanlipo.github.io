// Before the live tests: wait (up to LIVE_WAIT seconds) until the published service workers equal the
// local ones. Each sw.js carries the cache version = hash of everything the app needs, so equal sw.js
// files mean the deployment of this state is live. The tests then report any difference in detail.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, publishedFiles } from '../../scripts/lib.mjs';
import { request } from '@playwright/test';
import { LIVE_URL, PROXY } from '../../playwright.live.config.mjs';

export default async function waitForDeploy() {
  const files = ['index.html', ...publishedFiles().filter(f => f.endsWith('/sw.js'))];
  const until = Date.now() + Number(process.env.LIVE_WAIT || 0) * 1000;
  const api = await request.newContext({ proxy: PROXY });
  try { for (;;) {
    const stale = [];
    for (const f of files) {
      try {
        const res = await api.get(`${LIVE_URL}/${f}?live=${Date.now()}`);
        if (!res.ok() || await res.text() !== readFileSync(join(ROOT, f), 'utf8')) stale.push(f);
      } catch { stale.push(f); }
    }
    if (!stale.length) return console.log(`Live (${LIVE_URL}) entspricht dem lokalen Stand.`);
    if (Date.now() > until) return console.log(`Noch nicht live bzw. abweichend: ${stale.join(', ')}`);
    console.log(`Warte auf die Veröffentlichung (${stale.length} abweichend) …`);
    await new Promise(r => setTimeout(r, 15_000));
  } } finally { await api.dispose(); }
}
