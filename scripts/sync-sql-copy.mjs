#!/usr/bin/env node
/**
 * Depodaki SQL'i panelde kopyalanabilir metne çevirir.
 * ==========================================================================
 *   npm run sync:sql                 → config/supabaseSqlCopy.ts üretir
 *   npm run sync:sql -- --check       → kopya bayat mı? (kapı)
 *
 * Neden? Supabase'de "kural yayınlamak" yok: yetki kuralları (RLS) tablolarla
 * birlikte SQL olarak uygulanır. Tek doğrulama noktası `supabase/migrations/*.sql`.
 * Paneldeki “SQL'i kopyala” satırı bu üretilen dosyayı kullanır — Dashboard →
 * SQL Editor → Run dışında hiçbir şey yapılmaz, hiçbir anahtar girilmez.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const DIR = path.resolve(process.cwd());
const MIG_DIR = path.join(DIR, 'supabase', 'migrations');
const OUT = path.join(DIR, 'config', 'supabaseSqlCopy.ts');
const CHECK = process.argv.includes('--check');

const files = fs
  .readdirSync(MIG_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();
if (!files.length) {
  console.error(`SQL bulunamadı: ${path.relative(DIR, MIG_DIR)}`);
  process.exit(1);
}

const banner = files
  .map(f => `-- ── ${f} ${'─'.repeat(Math.max(2, 60 - f.length))}`)
  .join('\n');
const text = `${banner}\n${files
  .map(f => fs.readFileSync(path.join(MIG_DIR, f), 'utf8').trim())
  .join('\n\n')}\n`;

const sha = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const lines = text.split('\n').length;

const out = `/**
 * ÜRETİLMİŞ DOSYA — elle düzenlenmez. Kaynak: supabase/migrations/*.sql
 * Yenile: npm run sync:sql      Bayat mı: npm run sync:sql -- --check
 *
 * Amaç: Admin → Ayarlar → “SQL'i kopyala”. Uygulamanın beklediği tablolar ve RLS
 * kuralları budur; Dashboard → SQL Editor içine yapıştırılacak tek metin de budur.
 */

export const SUPABASE_SQL_NAME = ${JSON.stringify(files.join(' + '))};
export const SUPABASE_SQL_LINES = ${lines};
export const SUPABASE_SQL_SHA = ${JSON.stringify(sha)};

/** Uygulamanın beklediği şema + yetki kuralları (bayt bayt kopya). */
export const SUPABASE_SQL: string = ${JSON.stringify(text)};

/** Panelde gösterilecek tek satır. */
export function describeSupabaseSql(): string {
  return \`\${SUPABASE_SQL_NAME} • \${SUPABASE_SQL_LINES} satır • \${SUPABASE_SQL_SHA}\`;
}
`;

const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if (CHECK) {
  if (cur !== out) {
    console.error(
      '\x1b[31mBayat kopya:\x1b[0m config/supabaseSqlCopy.ts, supabase/migrations ile aynı değil.\n' +
        'Düzelt: npm run sync:sql'
    );
    process.exit(1);
  }
  console.log(`\x1b[32m✓\x1b[0m SQL kopyası güncel (${lines} satır, sha ${sha}).`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
console.log(`✓ config/supabaseSqlCopy.ts yazıldı — ${files.join(', ')} • ${lines} satır • sha ${sha}`);
