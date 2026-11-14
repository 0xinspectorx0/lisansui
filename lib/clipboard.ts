/**
 * Panelden metin kopyalama — yeni bağımlılık yok.
 *
 * Web'de `navigator.clipboard` kullanılır; native'de (veya izin yoksa) 'manual'
 * döner ve panel metni SEÇİLEBİLİR olarak gösterir: uzun bas → Kopyala.
 */
export type CopyResult = 'copied' | 'manual';

export async function copyText(text: string): Promise<CopyResult> {
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } })
      .navigator;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(String(text));
      return 'copied';
    }
    return 'manual';
  } catch {
    return 'manual';
  }
}
