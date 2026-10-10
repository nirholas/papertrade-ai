#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others) to recrawl every page in the
// live sitemap. Run after a deploy: `npm run seo:indexnow`. Reads the deployed sitemap, so it submits
// exactly what production serves.
import { readFile } from 'node:fs/promises';
import { INDEXNOW_KEY } from './indexnow-key.mjs';

const wrangler = JSON.parse((await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
const site = new URL(wrangler.vars.PUBLIC_URL);

const keyRes = await fetch(new URL(`/${INDEXNOW_KEY}.txt`, site));
if (!keyRes.ok || (await keyRes.text()).trim() !== INDEXNOW_KEY) {
  console.error(`The key file is not live at ${site.origin}/${INDEXNOW_KEY}.txt. Deploy first (npm run deploy).`);
  process.exit(1);
}

const sitemap = await fetch(new URL('/sitemap.xml', site)).then((r) => {
  if (!r.ok) throw new Error(`sitemap.xml returned ${r.status}`);
  return r.text();
});
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: site.host, key: INDEXNOW_KEY, keyLocation: `${site.origin}/${INDEXNOW_KEY}.txt`, urlList }),
});
if (res.status !== 200 && res.status !== 202) {
  console.error(`IndexNow rejected the submission: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(`IndexNow accepted ${urlList.length} URLs (${res.status}).`);
