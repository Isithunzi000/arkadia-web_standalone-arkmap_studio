// Harness — straznik PWA (wariant no-op SW, v1.43.0): manifest parsowalny i kompletny,
// pliki ikon istnieja i maja deklarowane wymiary, sw.js poprawny skladniowo i bez cache,
// tagi PWA w <head> + rejestracja SW w arkmap_studio.html. Uruchamianie z katalogu repo.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'arkmap_studio.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  OK   ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return null; // sygnatura PNG
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; // IHDR: width/height
}

// ── manifest.webmanifest ──────────────────────────────────────────────────
let manifest = null;
try { manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); }
catch (e) { ok(false, 'manifest.webmanifest: parsowanie JSON (' + e.message + ')'); }

if (manifest) {
  ok(true, 'manifest.webmanifest: parsowanie JSON');
  ok(manifest.name === 'ArkMap Studio', 'manifest: name = "ArkMap Studio"');
  ok(manifest.short_name === 'ArkMap', 'manifest: short_name = "ArkMap"');
  ok(manifest.start_url === './arkmap_studio.html', 'manifest: start_url wskazuje apke');
  ok(manifest.display === 'standalone', 'manifest: display = standalone');
  const mBg = HTML.match(/--bg:\s*(#[0-9a-fA-F]{6})/);
  ok(mBg && manifest.theme_color === mBg[1], 'manifest: theme_color = --bg z CSS (' + (mBg && mBg[1]) + ')');
  ok(mBg && manifest.background_color === mBg[1], 'manifest: background_color = --bg z CSS');
  ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3, 'manifest: >= 3 ikony (192/512/maskable)');
  const sizes = (manifest.icons || []).map(i => i.sizes);
  ok(sizes.includes('192x192') && sizes.includes('512x512'), 'manifest: rozmiary 192x192 i 512x512 obecne (instalowalnosc)');
  ok((manifest.icons || []).some(i => i.purpose === 'maskable'), 'manifest: ikona maskable obecna');
  for (const i of manifest.icons || []) {
    const f = path.join(ROOT, i.src);
    const dim = fs.existsSync(f) ? pngSize(f) : null;
    ok(!!dim && (dim.w + 'x' + dim.h) === i.sizes, 'manifest: plik ' + i.src + ' istnieje i ma wymiary ' + i.sizes);
  }
}

// ── sw.js: skladnia + gwarancja no-op (zero cache/fetch) ──────────────────
const swPath = path.join(ROOT, 'sw.js');
ok(fs.existsSync(swPath), 'sw.js: istnieje w root repo (scope)');
if (fs.existsSync(swPath)) {
  const SW = fs.readFileSync(swPath, 'utf8');
  let syntax = true;
  try { execFileSync(process.execPath, ['--check', swPath]); } catch (e) { syntax = false; }
  ok(syntax, 'sw.js: skladnia (node --check)');
  ok(SW.includes('skipWaiting') && SW.includes('clients.claim'), 'sw.js: install/activate (skipWaiting + clients.claim)');
  ok(!/caches\.|addEventListener\('fetch'|addEventListener\("fetch"/.test(SW), 'sw.js: NO-OP — brak cache i brak handlera fetch (swiadoma decyzja, wariant A)');
}

// ── tagi PWA w <head> + rejestracja SW ────────────────────────────────────
ok(HTML.includes('<link rel="manifest" href="manifest.webmanifest">'), 'head: link rel=manifest');
ok((HTML.match(/<meta name="theme-color"/g) || []).length === 1, 'head: meta theme-color (1x)');
ok(HTML.includes('<meta name="apple-mobile-web-app-capable" content="yes">'), 'head: apple-mobile-web-app-capable');
ok(HTML.includes('<link rel="apple-touch-icon" href="icons/icon-180.png">'), 'head: apple-touch-icon 180');
ok(HTML.includes('sizes="32x32" href="icons/favicon-32.png"'), 'head: favicon 32');
ok(HTML.includes('sizes="16x16" href="icons/favicon-16.png"'), 'head: favicon 16');
ok(HTML.includes("navigator.serviceWorker.register('sw.js').catch(() => {})"), 'head/script: rejestracja SW z cichym catch (bez gate — SW nic nie robi)');

// ── manual: sekcja PWA obecna i w spisie tresci ───────────────────────────
const MANUAL = fs.readFileSync(path.join(ROOT, 'docs', 'arkmap_manual.html'), 'utf8');
ok(MANUAL.includes('<h2 id="pwa">25. Instalacja jako aplikacja (PWA)</h2>'), 'manual: sekcja 25 PWA');
ok(MANUAL.includes('<li><a href="#pwa">Instalacja jako aplikacja (PWA)</a></li>'), 'manual: wpis PWA w TOC');

console.log('\npwa.js: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
