/**
 * Admin paneli SSR duman testi — gerçek ekranlar node'da render edilir.
 * Amaç: tip kontrolünün göremediği şeyleri yakalamak — render sırasında çökme
 * (TDZ, tanımsız değişken), JSX içinde şablon dizesine kaçmış `{...}` artığı,
 * toplu silme seçim → soru numarası eşlemesinin arama filtresiyle kayması.
 *
 * Çalıştır: npm run test:ui
 * Not: gölge dosyalar screens/_uishadow-*.tsx anında üretilir ve silinir.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lisansui-ui-'));
const SHADOW_PREFIX = 'screens/_uishadow-';
const written = [];

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${extra}`);
  }
};

/** react-native-web yoksa (ör. bağımlılıklar kurulu değil) test anlamsızdır. */
const skip = reason => {
  console.log(`\x1b[33mATLANDI\x1b[0m ${reason}`);
  cleanup();
  process.exit(0);
};
const have = rel => fs.existsSync(path.join(REPO, rel));
if (!have('node_modules/react-native-web')) skip('react-native-web kurulu değil');
if (!have('node_modules/react-dom')) skip('react-dom kurulu değil');
if (!have('screens/AdminQuestionsScreen.tsx')) skip('ekran bulunamadı');
for (const f of ['rn.js', 'icons.js', 'safe-area.js', 'navigation.js', 'async-storage.js', 'admin-context.js', 'admin-gate.js']) {
  if (!have(`scripts/admin-ui-shims/${f}`)) {
    console.log(`\x1b[31mFAIL\x1b[0m shim eksik: scripts/admin-ui-shims/${f}`);
    process.exit(1);
  }
}

const cleanup = () => {
  for (const f of written) {
    try {
      fs.unlinkSync(path.join(REPO, f));
    } catch {}
  }
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {}
};

/** Kaynak metni verili değişikliklerle screens/ içine gölge olarak yazar. */
function shadow(name, source, subs) {
  let s = source;
  for (const [from, to] of subs) {
    if (!s.includes(from)) {
      fail++;
      throw new Error(`gölge ankörü bulunamadı (${name}): ${from.slice(0, 60)}`);
    }
    s = s.replace(from, to, 1);
  }
  // CLI --alias göreli yolu kabul etmediğinden shim'leri doğrudan yola bağlıyoruz.
  const shim = f => path.join(REPO, 'scripts', 'admin-ui-shims', f);
  s = s
    .replace("from '../lib/AdminContext'", `from '${shim('admin-context.js')}'`)
    .replace("from '../components/admin/AdminGate'", `from '${shim('admin-gate.js')}'`);
  s = s.replace(
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';\nimport { renderToString } from 'react-dom/server';",
    1
  );
  s +=
    "\nexport function render() {\n  return renderToString(React.createElement(AdminQuestionsScreen as any));\n}\n";
  const file = `${SHADOW_PREFIX}${name}.tsx`;
  fs.writeFileSync(path.join(REPO, file), s, 'utf8');
  written.push(file);
  return file;
}

function bundle(entryFile, outName) {
  const shim = f => path.join(REPO, 'scripts', 'admin-ui-shims', f);
  const args = [
    '--yes',
    'esbuild',
    entryFile,
    '--bundle',
    '--format=cjs',
    '--platform=node',
    '--jsx=automatic',
    `--outfile=${TMP}/${outName}.cjs`,
    '--log-level=warning',
    '--define:process.env.NODE_ENV="development"',
    `--alias:react-native=${shim('rn.js')}`,
    `--alias:@expo/vector-icons/Ionicons=${shim('icons.js')}`,
    `--alias:react-native-safe-area-context=${shim('safe-area.js')}`,
    `--alias:@react-navigation/native=${shim('navigation.js')}`,
    `--alias:@react-native-async-storage/async-storage=${shim('async-storage.js')}`,
    `--alias:expo-secure-store=${shim('secure-store.js')}`,
  ];
  const r = spawnSync('npx', args, { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `paketleme başarısız (${entryFile}): ${((r.stderr || '') + (r.stdout || '')).split('\n').filter(Boolean).slice(0, 4).join(' / ')}`
    );
  }
  return path.join(TMP, `${outName}.cjs`);
}

const visible = html =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\|+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

async function renderOf(file) {
  const out = bundle(file, path.basename(file).replace(/[^a-z0-9-]/gi, '_'));
  const mod = await import(pathToFileURL(out).href);
  globalThis.__UI_CALLS__ = [];
  const html = mod.render();
  return { html, vis: visible(html), calls: globalThis.__UI_CALLS__ };
}

const SRC = 'screens/AdminQuestionsScreen.tsx';
const src = fs.readFileSync(path.join(REPO, SRC), 'utf8');

/** confirm state'inin başlangıç değerini değiştirir (deklarasyon çok satırlı). */
const openConfirm = type => {
  const start = src.indexOf('const [confirm, setConfirm] = useState<');
  if (start < 0) throw new Error('confirm bildirimi yok');
  const at = src.indexOf('(null);', start);
  if (at - start > 600) throw new Error('confirm başlangıcı bulunamadı');
  return [src.slice(start, at + '(null);'.length), src.slice(start, at) + `({ type: '${type}', index: -1 });`];
};
const [confirmFrom, confirmTo] = openConfirm('bulk');

console.log('\x1b[1m[1] sessiz durum — ekran çökmeden render oluyor\x1b[0m');
{
  const file = shadow('plain', src, []);
  const { html, vis, calls } = await renderOf(file);
  ok(html.length > 8000, `liste render edildi (${(html.length / 1024) | 0} KB)`);
  ok(vis.includes('Toplu sil '), '“Toplu sil” girişi var');
  ok(!vis.includes('toplu silme'), 'seçim kartı kapalıyken görünmüyor');
  ok(vis.includes('1. 1. Bucaş'), 'satır numarası + soru metni basılıyor');
  ok(!vis.includes('{') || !/\{[A-Za-z][^}]*\?/.test(vis), 'JSX ifadesi metne sızmamış');
  ok(!/rangeMode ===/.test(vis), 'şablon dizesinde ham JSX artığı yok');
  ok(calls.length === 0, 'render sırasında hiçbir mutasyon çağrılmadı');
}

console.log('\x1b[1m[2] seçim modu açık — kart, satırlar ve onay metni\x1b[0m');
{
  const file = shadow('select', src, [
    ['const [selectMode, setSelectMode] = useState(false);', 'const [selectMode, setSelectMode] = useState(true);'],
    ['const [selected, setSelected] = useState<string[]>([]);', "const [selected, setSelected] = useState<string[]>(['q2','q4']);"],
    ["const [rangeText, setRangeText] = useState('');", "const [rangeText, setRangeText] = useState('1-2, 4');"],
    [confirmFrom, confirmTo],
    ['const [lastDeleted, setLastDeleted] = useState<Question[] | null>(null);', "const [lastDeleted, setLastDeleted] = useState<Question[] | null>([{ id: 'q9', question: '9. Silinmis soru', options: ['a', 'b'], answer: 0, explanation: '' }]);"],
  ]);
  const { html, vis, calls } = await renderOf(file);
  ok(vis.includes('Konunun sorularını toplu silme'), 'toplu silme bölümü görünüyor');
  ok(/5<\/span>?\s*soru|5 soru/.test(vis.replace(/\|/g, '')) || vis.includes(' | 5 |'), 'konunun soru sayısı yazılıyor');
  ok(vis.includes('2 seçili'), 'iki kayıt seçili görünüyor');
  ok(html.includes('data-icon="checkbox"'), 'seçili satırda dolu kutu ikonu');
  ok((html.match(/data-icon="(checkbox|square-outline)"/g) || []).length === 5, 'beş satırın hepsi kutuya döndü', String((html.match(/data-icon="(checkbox|square-outline)"/g) || []).length));
  ok(html.includes('data-icon="square-outline"'), 'seçili olmayan satırlarda boş kutu ikonu');
  ok((vis.match(/— seçili/g) || []).length === 2, 'yalnız 2 satır “seçili” etiketli', String((vis.match(/— seçili/g) || []).length));
  ok(vis.includes('Tümünü seç (5)'), 'Tümünü seç sayacı doğru');
  ok(vis.includes('Görünenleri seç (5)'), 'Görünenleri seç sayacı doğru');
  ok(vis.includes('3 numara bulundu · 3 satır seçilecek'), 'aralık özeti “1-2, 4” → 3 satır', vis.slice(vis.indexOf('numara bulundu'), vis.indexOf('numara bulundu') + 80));
  ok(vis.includes('Seçilenleri sil (2)'), 'silme düğmesi seçim sayısını taşıyor');
  ok(vis.includes('Tekrarları ayıkla (0)'), 'tekrar yoksa ayıklama 0');
  ok(vis.includes('2 soru silinsin mi?'), 'onay modalı açıldı ve sayıyı başlığa yazdı');
  ok(vis.includes('Numaralar: 2, 4.'), 'seçili id’ler → kaynak numaraları 2 ve 4', vis.slice(vis.indexOf('kaldırılacak'), vis.indexOf('kaldırılacak') + 120));
  ok(vis.includes('Konuda 3 soru kalır'), 'kalan soru sayısı doğru');
  ok(vis.includes('Vazgeç') && /Seçilenleri sil \|$|Seçilenleri sil/.test(vis) && vis.includes('Seçilenleri sil'), 'onay modalı eylem düğmeleriyle basılıyor');
  ok(vis.includes('1 soruyu geri al'), 'silinen kayıt satırında geri-al düğmesi var');
  ok(vis.includes('listeye geri eklenir'), 'geri-al davranışı metinde açıklanıyor');
  ok(calls.length === 0, 'onay ekranı tek başına hiçbir şey silmiyor');
}

console.log('\x1b[1m[3] arama filtresi numaraları kaydırmıyor\x1b[0m');
{
  const file = shadow('filter', src, [
    ['const [selectMode, setSelectMode] = useState(false);', 'const [selectMode, setSelectMode] = useState(true);'],
    ['const [selected, setSelected] = useState<string[]>([]);', "const [selected, setSelected] = useState<string[]>(['q4']);"],
    ["const [search, setSearch] = useState('');", "const [search, setSearch] = useState('Bucaş');"],
    [confirmFrom, confirmTo],
  ]);
  const { vis } = await renderOf(file);
  ok(vis.includes('Görünenleri seç (3)'), 'filtre 3 satıra indirdi (Bucaş geçenler)');
  ok(vis.includes('1 seçili'), 'filtre dışı kalan seçim sayılmaya devam ediyor');
  ok(vis.includes('1 soru kaldırılacak'), 'onay metni tek kaydı söylüyor');
  ok(vis.includes('Numaralar: 4.'), 'seçili kaydın numarası filtreden bağımsız (4)');
  ok(vis.includes('Konuda 4 soru kalır'), 'kalan sayısı kaynak listesinden hesaplanıyor');
}

console.log('\x1b[1m[4] konu seçici ve toplu ekleme hâlâ yerinde\x1b[0m');
{
  const { vis } = await renderOf(shadow('plain2', src, []));
  ok(vis.includes('— diğerleri için dokun'), 'katlı konu seçici ipucu duruyor');
  ok(vis.includes('Tekli soru ekle') && vis.includes('Toplu ekle'), 'ekleme kısayolları duruyor');
  ok(!/Konu seç —/.test(vis), 'konu listesi kapalı başlıyor');
}

console.log('\x1b[1m[5] ayarlar ekranı — Firebase anahtarı kullanıcıdan istenmiyor\x1b[0m');
{
  const SET_SRC = 'screens/AdminSettingsScreen.tsx';
  const setSrc = fs.readFileSync(path.join(REPO, SET_SRC), 'utf8');

  /** `import { a, b } from '<spec>';` ifadesini dizi taramayla bulur (regex kaçışı kırılgan). */
  const findImport = (source, spec) => {
    const tail = `from '${spec}';`;
    const fromIdx = source.indexOf(tail);
    if (fromIdx < 0) return null;
    const start = source.lastIndexOf('import', fromIdx);
    const open = source.indexOf('{', start);
    const close = source.lastIndexOf('}', fromIdx);
    if (start < 0 || open < 0 || open > fromIdx || close < open) return null;
    const names = source
      .slice(open + 1, close)
      .split(',')
      .map(x => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    return { statement: source.slice(start, fromIdx + tail.length), names };
  };

  // Ayarlar ekranı onlarca bağlama/API’ye dokunuyor; hepsi nötr stub’a bağlanır,
  // böylece EKRAN’IN KODU ve JSX’i gerçek hâliyle render edilmiş olur.
  const stubbed = [
    '../lib/AppContext',
    '../lib/AdminContext',
    '../lib/MembershipContext',
    '../lib/contentSeed',
    '../lib/contentCopy',
    '../lib/firestoreApi',
    '../lib/firebaseConfig',
  ];
  const shimDir = path.join(TMP, 'stubs');
  fs.mkdirSync(shimDir, { recursive: true });
  const plainPath = path.join(REPO, 'scripts', 'admin-ui-shims', 'plain.js');
  const stubLine = n => {
    if (/^use[A-Z]/.test(n)) return `export const ${n} = neutralHook;`;
    // Kaynakta çağrılan isimler fonksiyon gibi durmalı; değer olanlar nesne gibi
    // (aksi halde React child olarak görüp "Functions are not valid" diye bağırır).
    const called = new RegExp(`${n}\\s*\\(`).test(setSrc);
    return `export const ${n} = ${called ? 'callable' : 'plain'};`;

  };
  let shadowSrc = setSrc;
  const seen = new Set();
  for (const spec of stubbed) {
    const found = findImport(shadowSrc, spec);
    if (!found) {
      fail++;
      throw new Error(`ayarlar gölgesi: import bulunamadı (${spec})`);
    }
    const file = path.join(shimDir, `${spec.replace(/[^a-z0-9]/gi, '_')}.js`);
    const lines = [`import { plain, neutralHook, callable } from '${plainPath}';`];
    for (const n of found.names) {
      if (seen.has(n)) continue;
      seen.add(n);
      lines.push(stubLine(n));
    }
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
    shadowSrc = shadowSrc.replace(found.statement, `import {${found.names.join(',')}} from '${file}';`);
  }
  ok(true, 'ayarlar gölgesi: 6 modül nötr stub’a bağlandı', `${seen.size} export`);
  const uiShim = f => path.join(REPO, 'scripts', 'admin-ui-shims', f);
  // AdminGate (PIN kapısı) gerçek shim ile açılır; AdminContext yukarıda stub’landı.
  shadowSrc = shadowSrc.replace(
    "from '../components/admin/AdminGate'",
    `from '${uiShim('admin-gate.js')}'`
  );
  shadowSrc = shadowSrc.replace(
    "import React, { useEffect, useState } from 'react';",
    "import React, { useEffect, useState } from 'react';\nimport { renderToString } from 'react-dom/server';"
  );
  shadowSrc +=
    '\nexport function render() {\n  return renderToString(React.createElement(AdminSettingsScreen as any));\n}\n';
  const setFile = `${SHADOW_PREFIX}settings.tsx`;
  fs.writeFileSync(path.join(REPO, setFile), shadowSrc, 'utf8');
  written.push(setFile);

  const { html, vis } = await renderOf(setFile);
  const repoKey = ((fs.readFileSync(path.join(REPO, 'config', 'firebaseApp.ts'), 'utf8').match(/apiKey:\s*'([^']*)'/) || [])[1] || '').trim();
  ok(html.length > 8000, `ayarlar ekranı çökmeden render edildi (${(html.length / 1024) | 0} KB)`);
  if (process.env.UI_DUMP) console.log('DUMP>>>', vis.slice(vis.indexOf('Firebase Auth (kimlik'), vis.indexOf('Firebase Auth (kimlik') + 2200));
  ok(vis.includes('Firebase Auth (kimlik doğrulama)'), 'Firebase Auth bölümü görünüyor');
  ok(!vis.includes('Web API anahtarı (apiKey)'), 'apiKey yapıştırma alanı ekranda YOK');
  ok(!/placeholder="AIza[^"]*"/.test(html), 'AIza… placeholder’lı input basılmıyor');
  ok(vis.includes('config/firebaseApp.ts'), 'ekran anahtarın depodan geldiğini söylüyor');
  ok(!/Kaydet \| Kaldır/.test(vis), '“Kaydet / Kaldır” anahtar formu kaldırıldı');
  if (repoKey) {
    ok(vis.includes('firebase-auth') && vis.includes('depoya gömülü config'), 'depoda anahtar var → kaynak “repo” gösteriliyor');
    ok(vis.includes('Kaynak:'), 'anahtar kaynağı satırı basılıyor');
  } else {
    ok(vis.includes('Yerel mod'), 'depoda anahtar yok → yerel mod açıkça söyleniyor');
    ok(vis.includes('geliştiriciye iletmek'), 'kullanıcıya “yapıştır” değil “ilet” deniyor');
  }
  ok(!vis.includes('EXPO_PUBLIC_FIREBASE_API_KEY'), 'panel kullanıcıya ortam değişkeni ezberletmiyor');
  ok(!/Bu cihazda kayıtlı eski anahtar/.test(vis), 'cihaz anahtarı yoksa o satır da görünmüyor');
  ok(vis.includes('Erişim tanısı ve kurallar'), '“Erişim tanısı ve kurallar” bölümü var');
  ok(vis.includes('Neden engellendi?'), 'tanı satırı görünüyor');
  ok(vis.includes('firestore.rules metnini kopyala'), 'kuralları kopyalama girişi var');
  ok(vis.includes('Kural metnini göster'), 'kural metni gizli-göster satırı var');
  ok(!vis.includes('rules_version'), 'kural metni varsayılan olarak basılmıyor (sadece “Göster” deyince)');
  ok(!vis.includes('API anahtarını'), 'tanı bölümü kullanıcıdan anahtar istemiyor');
  ok(vis.includes('Yazma sınaması (kendi belgen)'), 'yazma sınaması satırı görünüyor');
  ok(vis.includes('Sına'), 'sınama düğmesi basılabilir durumda');
  ok(vis.includes('VIP/rol/durum alanlarına dokunulmaz'), 'sınamanın zararsız olduğu yazıyor');
  ok(vis.includes('E-posta (isteğe bağlı — kesin tanı için)'), 'tanı için e-posta alanı var');
  ok(!vis.includes('Henüz denenmedi'), 'sınama sonucu preslenmeden boş mesaj basılmıyor');
}

cleanup();
console.log(`\n\x1b[1m${fail === 0 ? '\x1b[32m' : '\x1b[31m'}${pass}/${fail + pass} kontrol\x1b[0m\n`);
process.exit(fail ? 1 : 0);
