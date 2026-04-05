// Fetch Omeka S theme metadata from GitHub and render a static site into docs/.
// Runs on Node 18+ (uses global fetch). Zero dependencies.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const TOKEN = process.env.GITHUB_TOKEN;
const CSV_URL = 'https://raw.githubusercontent.com/Daniel-KM/UpgradeToOmekaS/master/_data/omeka_s_themes.csv';
const OUT_DIR = 'docs';
const SITE_URL = 'https://nakamura196.github.io/OmekaS/';
const SITE_TITLE = 'Omeka S Themes';
const SITE_DESCRIPTION_JA = 'GitHub 上で公開されている Omeka S テーマの一覧';
const SITE_DESCRIPTION_EN = 'A visual catalog of Omeka S themes hosted on GitHub.';
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const MAX_RETRIES = 4;
const USER_AGENT = 'omeka-s-themes-builder (+https://github.com/nakamura196/OmekaS)';

// ---------- helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function githubApi(url, attempt = 0) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    if (attempt < MAX_RETRIES) {
      await sleep(1000 * 2 ** attempt);
      return githubApi(url, attempt + 1);
    }
    throw e;
  }

  // Handle secondary rate limit / abuse detection / primary exhaustion.
  if (res.status === 403 || res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    let waitMs;
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      waitMs = retryAfter * 1000;
    } else if (remaining === 0 && Number.isFinite(reset)) {
      waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
    } else {
      waitMs = 1000 * 2 ** attempt;
    }
    if (attempt < MAX_RETRIES) {
      await sleep(waitMs);
      return githubApi(url, attempt + 1);
    }
  }

  if (res.status === 200) return { status: 200, data: await res.json() };
  return { status: res.status, data: null };
}

// Simple promise pool: runs `worker(item, index)` with at most `limit` in flight.
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// Minimal CSV parser: handles quoted fields with escaped quotes.
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchCsvUrls() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const rows = parseCsv(await res.text());
  const headers = rows[0];
  const urlIdx = headers.findIndex(h => h.trim().toLowerCase() === 'url');
  if (urlIdx === -1) throw new Error('Url column not found in CSV');
  return rows.slice(1).map(r => (r[urlIdx] || '').trim()).filter(Boolean);
}

async function fetchRepoMetadata(repoUrl) {
  const parts = repoUrl.replace(/\/+$/, '').split('/');
  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];
  if (!owner || !repo) return null;

  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const { status, data } = await githubApi(apiBase);
  if (status !== 200 || !data || data.message === 'Not Found') return null;

  const themeRes = await githubApi(`${apiBase}/contents/theme.jpg`);
  const theme_url = themeRes.status === 200 ? themeRes.data.download_url : null;

  const advRes = await githubApi(`${apiBase}/contents/view/common/advanced-search`);
  const has_advanced_search = advRes.status === 200;

  return {
    name: data.name,
    owner: data.owner?.login ?? owner,
    url: data.html_url,
    description: data.description,
    stars: data.stargazers_count ?? 0,
    last_updated: data.updated_at ?? null,
    theme_url,
    has_advanced_search,
  };
}

// ---------- OGP image ----------

function renderOgpSvg(themeCount, advancedCount) {
  // 1200x630 OGP image with a decorative grid of squares representing themes,
  // plus title / subtitle / footer text. Latin-only text to avoid font issues.
  const cols = 16;
  const rows = 9;
  const cellSize = 40;
  const gap = 6;
  const gridW = cols * cellSize + (cols - 1) * gap;
  const gridH = rows * cellSize + (rows - 1) * gap;
  const gridX = 1200 - gridW - 60;
  const gridY = (630 - gridH) / 2;

  const cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (cellSize + gap);
    const y = gridY + row * (cellSize + gap);
    const filled = i < themeCount;
    const opacity = filled ? 0.85 : 0.15;
    const fill = filled && i < advancedCount ? '#7ee7ff' : '#ffffff';
    cells.push(
      `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="6" fill="${fill}" opacity="${opacity}"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b3d91"/>
      <stop offset="0.55" stop-color="#0969da"/>
      <stop offset="1" stop-color="#1f6feb"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g>${cells.join('')}</g>
  <g font-family="Helvetica, Arial, sans-serif" fill="#ffffff">
    <text x="60" y="200" font-size="40" font-weight="500" opacity="0.85">A visual catalog of</text>
    <text x="60" y="300" font-size="96" font-weight="800" letter-spacing="-2">Omeka S</text>
    <text x="60" y="400" font-size="96" font-weight="800" letter-spacing="-2">Themes</text>
    <text x="60" y="470" font-size="34" font-weight="500" opacity="0.9">${themeCount} themes · ${advancedCount} with advanced search</text>
    <text x="60" y="570" font-size="26" opacity="0.75">nakamura196.github.io/OmekaS</text>
  </g>
</svg>`;
}

async function writeOgpImage(themes) {
  const advancedCount = themes.filter((t) => t.has_advanced_search).length;
  const svg = renderOgpSvg(themes.length, advancedCount);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  await writeFile(path.join(OUT_DIR, 'ogp.png'), png);
}

// ---------- template ----------

function renderHtml(themes, builtAt) {
  // Client-side template literals below are escaped as \${...} so the outer
  // template literal here does not try to evaluate them at build time.
  const dataJson = JSON.stringify(themes).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${SITE_TITLE}</title>
<meta name="description" content="${SITE_DESCRIPTION_JA}">
<link rel="canonical" href="${SITE_URL}">

<!-- Favicon -->
<link rel="icon" type="image/svg+xml" href="./favicon.svg">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_TITLE}">
<meta property="og:title" content="${SITE_TITLE}">
<meta property="og:description" content="${SITE_DESCRIPTION_JA}">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}ogp.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${SITE_DESCRIPTION_EN}">
<meta property="og:locale" content="ja_JP">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${SITE_TITLE}">
<meta name="twitter:description" content="${SITE_DESCRIPTION_JA}">
<meta name="twitter:image" content="${SITE_URL}ogp.png">
<meta name="twitter:image:alt" content="${SITE_DESCRIPTION_EN}">
<style>
  :root {
    --bg: #f6f8fa; --card: #fff; --text: #24292f; --muted: #57606a;
    --border: #d0d7de; --accent: #0969da; --badge-bg: #ddf4ff;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { background: #fff; border-bottom: 1px solid var(--border); padding: 28px 0; }
  .container { max-width: 1280px; margin: 0 auto; padding: 0 20px; }
  h1 { margin: 0 0 6px; font-size: 28px; }
  .subtitle { color: var(--muted); margin: 0; font-size: 14px; }
  .controls { display: flex; gap: 12px; margin: 24px 0; flex-wrap: wrap; align-items: center; }
  .controls input[type="search"], .controls select {
    padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;
    font-size: 14px; background: #fff; color: var(--text);
  }
  .controls input[type="search"] { flex: 1; min-width: 220px; }
  .controls label { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted); cursor: pointer; }
  .count { color: var(--muted); font-size: 13px; margin-left: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding-bottom: 48px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; transition: transform .12s ease, box-shadow .12s ease; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.08); }
  .thumb { width: 100%; aspect-ratio: 16/9; object-fit: cover; background: #eaeef2; border-bottom: 1px solid var(--border); display: block; }
  .thumb-placeholder { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #eaeef2, #d0d7de); color: #8c959f; font-size: 40px; border-bottom: 1px solid var(--border); }
  .body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; }
  .name { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
  .owner { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  .desc { font-size: 13px; color: var(--text); flex: 1; margin: 0 0 12px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .meta { display: flex; gap: 12px; font-size: 12px; color: var(--muted); flex-wrap: wrap; align-items: center; }
  .badge { display: inline-block; background: var(--badge-bg); color: var(--accent); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
  .empty { text-align: center; padding: 48px 16px; color: var(--muted); }
  footer { text-align: center; padding: 24px 16px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); background: #fff; }
</style>
</head>
<body>
<header>
  <div class="container">
    <h1>${SITE_TITLE}</h1>
    <p class="subtitle">${SITE_DESCRIPTION_JA}</p>
  </div>
</header>
<main class="container">
  <div class="controls">
    <input type="search" id="q" placeholder="名前・説明・オーナーで検索…" autocomplete="off">
    <select id="sort">
      <option value="stars">スター数 (多い順)</option>
      <option value="updated">更新日 (新しい順)</option>
      <option value="name">名前 (A→Z)</option>
    </select>
    <label><input type="checkbox" id="adv"> 高度検索対応のみ</label>
    <span class="count" id="count"></span>
  </div>
  <div class="grid" id="grid"></div>
</main>
<footer>
  Built at ${builtAt} · Source: <a href="https://github.com/Daniel-KM/UpgradeToOmekaS" target="_blank" rel="noopener">UpgradeToOmekaS</a>
</footer>
<script id="data" type="application/json">${dataJson}</script>
<script>
(function () {
  const themes = JSON.parse(document.getElementById('data').textContent);
  const grid = document.getElementById('grid');
  const q = document.getElementById('q');
  const sort = document.getElementById('sort');
  const adv = document.getElementById('adv');
  const count = document.getElementById('count');

  const esc = (s) => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (s) => s ? s.split('T')[0] : '—';

  function render() {
    const needle = q.value.trim().toLowerCase();
    const onlyAdv = adv.checked;
    let list = themes.filter(t => {
      if (onlyAdv && !t.has_advanced_search) return false;
      if (!needle) return true;
      return (t.name || '').toLowerCase().includes(needle)
        || (t.owner || '').toLowerCase().includes(needle)
        || (t.description || '').toLowerCase().includes(needle);
    });
    const mode = sort.value;
    list.sort((a, b) => {
      if (mode === 'stars') return (b.stars || 0) - (a.stars || 0);
      if (mode === 'updated') return (b.last_updated || '').localeCompare(a.last_updated || '');
      return (a.name || '').localeCompare(b.name || '');
    });
    count.textContent = list.length + ' themes';
    if (list.length === 0) {
      grid.innerHTML = '<div class="empty">該当するテーマがありません</div>';
      return;
    }
    grid.innerHTML = list.map(t => \`
      <article class="card">
        \${t.theme_url
          ? \`<img class="thumb" src="\${esc(t.theme_url)}" alt="\${esc(t.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'thumb-placeholder\\'>📦</div>'">\`
          : '<div class="thumb-placeholder">📦</div>'}
        <div class="body">
          <h3 class="name"><a href="\${esc(t.url)}" target="_blank" rel="noopener">\${esc(t.name)}</a></h3>
          <div class="owner">@\${esc(t.owner)}</div>
          <p class="desc">\${esc(t.description || '')}</p>
          <div class="meta">
            <span>★ \${t.stars || 0}</span>
            <span>\${fmtDate(t.last_updated)}</span>
            \${t.has_advanced_search ? '<span class="badge">Advanced Search</span>' : ''}
          </div>
        </div>
      </article>
    \`).join('');
  }

  q.addEventListener('input', render);
  sort.addEventListener('change', render);
  adv.addEventListener('change', render);
  render();
})();
</script>
</body>
</html>
`;
}

// ---------- main ----------

async function main() {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : -1;

  console.log('Fetching theme list CSV…');
  let urls = await fetchCsvUrls();
  if (limit > 0) urls = urls.slice(0, limit);
  console.log(`Found ${urls.length} repositories (concurrency=${CONCURRENCY})`);

  let done = 0;
  const results = await pool(urls, CONCURRENCY, async (url) => {
    let status = 'skip';
    let metadata = null;
    try {
      metadata = await fetchRepoMetadata(url);
      if (metadata) status = '✓';
    } catch (e) {
      status = `error: ${e.message}`;
    }
    done++;
    console.log(`[${done}/${urls.length}] ${url} ${status}`);
    return metadata;
  });
  const themes = results.filter(Boolean);
  // Deterministic ordering: stars desc, then name asc.
  themes.sort((a, b) => (b.stars || 0) - (a.stars || 0) || (a.name || '').localeCompare(b.name || ''));

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, 'theme_metadata.json'),
    JSON.stringify(themes, null, 2) + '\n',
  );
  await writeFile(
    path.join(OUT_DIR, 'index.html'),
    renderHtml(themes, new Date().toISOString()),
  );
  await writeOgpImage(themes);
  console.log(`\nWrote ${themes.length} themes to ${OUT_DIR}/ (index.html, theme_metadata.json, ogp.png)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
