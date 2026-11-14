#!/usr/bin/env node
/**
 * firestore.rules metnini uygulamaya kopyalar → config/firestoreRulesCopy.ts.
 *
 * Neden: paneldeki “Kuralları kopyala” düğmesi, Console'a yapıştırılacak METNİ
 * uygulamayla birlikte taşımalı ki telefondayken bile kuralları yayınlamak tek
 * adıma insin. Tek kaynak `firestore.rules` kalsın diye bu kopya ÜRETİLİR ve
 * `npm run test:auth` kopyanın güncel olduğunu denetler.
 *
 * Kullanım:
 *   npm run sync:rules                  # yaz
 *   node scripts/sync-rules-copy.mjs --check   # fark varsa çıkış 1
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'firestore.rules');
const OUT = path.join(root, 'config', 'firestoreRulesCopy.ts');
const CHECK = process.argv.includes('--check');
const BT = String.fromCharCode(96); // `  (kaçış derdi olmadan)

const rules = fs.readFileSync(SRC, 'utf8');
const escaped = rules.replace(/\\/g, '\\\\').replace(new RegExp(BT, 'g'), '\\' + BT).replace(/\$\{/g, '\\${');
const lineCount = rules.split('\n').length;

const body = [
  '/**',
  ' * ÜRETİLMİŞ DOSYA — elle düzenleme.',
  ' *',
  ' * Kaynak: firestore.rules. Yenilemek için: npm run sync:rules',
  ' * (npm run test:auth bu kopyanın güncel olduğunu denetler.)',
  ' *',
  ' * Amaç: paneldeki “Kuralları kopyala” düğmesi bu metni panoya alır; kullanıcı',
  ' * Console → Firestore → Rules → yapıştır → Publish ile tek adımda yayınlar.',
  ' */',
  `export const FIRESTORE_RULES_TEXT = ${BT}${escaped}${BT};`,
  '',
  '/** Kopya kaç satırlık bir metin taşıyor (panel özeti için). */',
  `export const FIRESTORE_RULES_LINES = ${lineCount};`,
  ''
].join('\n');

const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (CHECK) {
  if (current !== body) {
    console.error('✗ config/firestoreRulesCopy.ts bayat — `npm run sync:rules` çalıştır.');
    process.exit(1);
  }
  console.log(`✓ config/firestoreRulesCopy.ts güncel (${lineCount} satır)`);
} else {
  fs.writeFileSync(OUT, body);
  console.log(`✓ config/firestoreRulesCopy.ts yazıldı (${lineCount} satır)`);
}
