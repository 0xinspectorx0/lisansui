/**
 * ?sql=1 — salt-okunur SQL teslim sayfası.
 * ============================================================================
 * Kurulum tek bir şeyi gerektirir: `supabase/migrations/0001_init.sql` içeriğini
 * Supabase → SQL Editor'a yapıştırmak. Bu sayfa o metni, panelin PIN kapısına
 * girmeden gösterir; yani uygulamanın kendisi bozuk olsa bile tek bir URL ile
 * kopyalanabilir.
 *
 * Neden ayrı bir sayfa?
 *  • Panelden farklı olarak hiçbir context'e (App/Admin/Membership) dokunmaz —
 *    veri katmanı çökmüşken de açılır. Bu, sayfanın tek işidir: metni göstermek.
 *  • Yazma yapmaz, istek atmaz, depoya dokunmaz. Pano erişimi yoksa metin
 *    zaten seçilebilir durumdadır.
 *
 * `?seed=` benzeri bir dışa aktarım BURADA değil panelde: admin.exportJson()
 * içeriği zaten panelde düz metin olarak basılıyor (kopyala → yedek.json).
 */
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SUPABASE_SQL, describeSupabaseSql } from '../config/supabaseSqlCopy';

/** `/?sql=1` (web) — hash路由 olan paketlerde `#/?sql=1` biçimi de kabul edilir. */
export function sqlDeliveryRequested(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const loc: any = (window as any).location;
  const search = String(loc?.search || '');
  const hash = String(loc?.hash || '').replace(/^#/, '');
  return /[?&]sql=1\b/.test(search) || /[?&]sql=1\b/.test(hash);
}

export function SqlDeliveryScreen() {
  const [note, setNote] = useState<string | null>(null);

  const copy = async () => {
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(SUPABASE_SQL);
        setNote('Kopyalandı — Supabase → SQL Editor içine yapıştır ve Run’a bas.');
        return;
      }
    } catch {
      /* pano kapalıysa metin zaten seçilebilir */
    }
    setNote('Pano bu cihazda kapalı — aşağıdaki metni seçip kopyalayabilirsin.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Supabase — tablolar ve RLS</Text>
        <Text style={styles.meta}>{describeSupabaseSql()}</Text>
        <Text style={styles.body}>
          Bu sayfa yalnız gösterir: hiçbir yere yazmaz, istek atmaz, PIN sormaz.{'\n'}
          Sıra: Supabase Dashboard → SQL Editor → New query → yapıştır → Run.{'\n'}
          Çalıştırma tekrar tekrar yapılabilir; betik idempotent’tir (create or replace /
          if not exists) ve veri tohumlamaz.
        </Text>
        <Pressable onPress={() => void copy()} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>SQL metnini kopyala</Text>
        </Pressable>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <ScrollView style={styles.sqlBox} contentContainerStyle={styles.sqlInner}>
        <Text selectable style={styles.sql}>
          {SUPABASE_SQL}
        </Text>
      </ScrollView>
      <Text style={styles.foot}>
        Karşılaştırma için aynı metin depoda: supabase/migrations/0001_init.sql — panelde
        “SQL — tablolar ve RLS” kartı da bunu gösterir.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B1020', padding: 14, gap: 10 },
  card: { backgroundColor: '#141B31', borderRadius: 14, padding: 14, gap: 8 },
  title: { color: '#F8FAFC', fontSize: 17, fontWeight: '700' },
  meta: { color: '#93C5FD', fontSize: 11.5, fontFamily: 'monospace' },
  body: { color: '#CBD5E1', fontSize: 12.5, lineHeight: 19 },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  note: { color: '#A7F3D0', fontSize: 11.5 },
  sqlBox: { flex: 1, backgroundColor: '#0F1528', borderRadius: 14, borderWidth: 1, borderColor: '#1F2A44' },
  sqlInner: { padding: 12 },
  sql: { color: '#E2E8F0', fontSize: 11.5, fontFamily: 'monospace', lineHeight: 17 },
  foot: { color: '#94A3B8', fontSize: 11, lineHeight: 16 },
});
