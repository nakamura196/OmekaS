/**
 * 公開 URL (https://omeka.ldas.jp) を決めている箇所を固定する。
 * URL の正本は scripts/build.mjs の SITE_URL。docs/ は毎日そこから作り直される。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_URL, renderHtml, renderOgpSvg, renderRobots, renderSitemap } from '../scripts/build.mjs';

const SITE = 'https://omeka.ldas.jp';
const read = (p) => readFileSync(new URL(`../docs/${p}`, import.meta.url), 'utf8');
const attrs = (html) => ({
  canonical: html.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
  ogUrl: html.match(/property="og:url" content="([^"]+)"/)?.[1],
  images: [...html.matchAll(/(?:property="og:image"|name="twitter:image")\s+content="([^"]+)"/g)].map((m) => m[1]),
});

test('SITE_URL は新ホストの / (末尾スラッシュ付き)', () => {
  assert.equal(SITE_URL, `${SITE}/`);
});

test('生成する HTML: canonical・og:url・og:image・twitter:image が新ホスト', () => {
  const a = attrs(renderHtml([], '2026-01-01T00:00:00.000Z'));
  assert.equal(a.canonical, `${SITE}/`);
  assert.equal(a.ogUrl, `${SITE}/`);
  assert.deepEqual(a.images, [`${SITE}/ogp.png`, `${SITE}/ogp.png`]);
});

test('生成する OGP 画像に焼き込むホスト名が新ホスト (旧 github.io が残らない)', () => {
  const svg = renderOgpSvg(1, 0);
  assert.ok(svg.includes('>omeka.ldas.jp</text>'));
  assert.ok(!svg.includes('github.io'));
});

test('生成する robots.txt と sitemap.xml が新ホストを指す', () => {
  assert.match(renderRobots(), new RegExp(`^Sitemap: ${SITE}/sitemap\\.xml$`, 'm'));
  const locs = [...renderSitemap('2026-01-01T00:00:00.000Z').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [`${SITE}/`]);
});

test('コミット済みの docs/ も同じ URL で作られている', () => {
  assert.equal(read('CNAME'), 'omeka.ldas.jp\n');
  const a = attrs(read('index.html'));
  assert.equal(a.canonical, `${SITE}/`);
  assert.equal(a.ogUrl, `${SITE}/`);
  assert.deepEqual(a.images, [`${SITE}/ogp.png`, `${SITE}/ogp.png`]);
  assert.equal(read('robots.txt'), renderRobots());
});

test('毎日の自動更新が CNAME・robots.txt・sitemap.xml もコミットする (外れると独自ドメインが消える)', () => {
  const wf = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
  const add = wf.match(/git add ([^\n]+)/)?.[1] ?? '';
  for (const f of ['docs/index.html', 'docs/theme_metadata.json', 'docs/ogp.png', 'docs/CNAME', 'docs/robots.txt', 'docs/sitemap.xml']) {
    assert.ok(add.split(/\s+/).includes(f), `build.yml の git add に ${f} が無い`);
  }
});
