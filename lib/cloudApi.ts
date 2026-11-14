/**
 * Bulut API'si — üyeliğin ve içeriğin TEK kaynağı: Supabase (Postgres).
 *
 * Eski hâli Supabase REST üzerindeydi; artık her çağrı `lib/sbGateway.ts`
 * üzerinden Supabase RPC'sine gider ve Postgres satırlara dağıtır
 * (`courses` → `topics` → `questions`, `members`, `membership_policy`, `tips`,
 * `user_tests`, `user_data`). Yetki denetimi de orada: RLS + yazma bekçileri
 * (supabase/migrations/0001_init.sql).
 *
 * Bu modülün sözleşmesi değişmedi: çağrılar belge diliyle konuşur, red anında
 * `CloudOutcome` döner ve İŞLEM REDDEDİLMİŞ SAYILIR — cihazda kuyruk, bekletilen
 * yazma ya da yerel hesap/profil oluşmaz.
 */
import {
  checkMemberFields,
  coerceMemberFields,
  shapeProblemText,
} from './memberShape';
import {
  MemberDoc,
  MembershipStatus,
  VipPlanId,
  emptyMember,
  memberFromFields,
  memberToFields,
  normalizeEmail,
} from './membership';

import {
  MEMBERSHIPS_COLLECTION_NAME,
  cloudTarget,
  collectionPath,
} from './supabaseConfig';
import {
  consumedForeignTokenNotice,
  consumeTokenRefreshNotice,
  docUrl,
  fieldsToJson,
  jsonToFields,
  request,
  restFetch,
  SbResponse,
  SbValue,
} from './sbGateway';
import * as auth from './authClient';

/** Çözümlenmiş hedef (panelde gösterilir; lib/supabaseConfig.ts tek kaynak). */
export const CLOUD_TARGET = cloudTarget();
/** Eski proje/kimlik satırı — panelde Supabase host'u olarak gösterilir. */
export const CLOUD_PROJECT_LABEL = (CLOUD_TARGET.url || '').replace(/^https?:\/\/@*/, '').split('.')[0] || '—';
export const MEMBERSHIPS_COLLECTION = collectionPath(MEMBERSHIPS_COLLECTION_NAME);

export const membersDocPath = (memberId: string) =>
  `${MEMBERSHIPS_COLLECTION}/${encodeURIComponent(String(memberId).toLowerCase())}`;

/* ------------------------------------------------------------ value types */

/** Değer zarfı tipi Supabase geçidinde tanımlıdır (biçim eskiyle aynı). */
export type FbValue = SbValue;

export const str = (v: string): FbValue => ({ stringValue: v });
export const int = (v: number): FbValue => ({ integerValue: String(Math.round(v || 0)) });
export const bool = (v: boolean): FbValue => ({ booleanValue: !!v });
export const nullVal = (): FbValue => ({ nullValue: null });
export const strMap = (obj: Record<string, string>): FbValue => ({
  mapValue: { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, str(String(v))])) },
});
export const arr = (values: FbValue[]): FbValue => ({ arrayValue: { values } });
export const fbMap = (fields: Record<string, FbValue>): FbValue => ({ mapValue: { fields } });

/* ------------------------------------------------------------------ fetch */

/**
 * Supabase Auth bağlıysa (config/supabaseApp.ts ya da EXPO_PUBLIC_SUPABASE_ANON_KEY)
 * her isteğe idToken eklenir;
 * böylece Supabase RLS kuralları üyelik satırlarını oturum kimliği ile koruyabilir.
 * Token alınamazsa istek kimliksiz gider ve RLS izin verirse çalışır.
 */
/**
 * Oturum token'ı sorununa işaret eden yanıt metinleri. Bunlar KURAL reddinden
 * farklıdır: token bayatladıysa aynı istek taze token'la geçer. Üyelik yazmasını
 * "kural engelledi" saymadan önce bunu bir kez kendimiz deniyoruz — kalıcı çözüm
 * burada, çünkü bayat token cihazda sessizce birikiyor ve tek belirtisi 403.
 */
/* ------------------------------------------------------------------------- */
/* Geçiş katmanı (token, hata eşlemesi, RPC zarfı) lib/sbGateway.ts'te durur. */
/* ------------------------------------------------------------------------- */

/** Bayat oturum token’ı tazelenip istek yeniden denendi mi? (bir kez bildirilir.) */
export { consumeTokenRefreshNotice, consumedForeignTokenNotice };

/**
 * Supabase’de anahtar URL parametresi diye bir şey yoktur (`apikey` başlığı yeter);
 * eski panel satırları bu yüzden daima `false` döner — arayüz bozulmasın diye durur.
 */
export function consumeApiKeyParamNotice(): boolean {
  return false;
}
export function isApiKeyParamPreferred(): boolean {
  return false;
}

/** Panelin yoklama satırı: bu belge yolu hangi RPC'ye düşüyor (kopyalanabilir). */
export function cloudRequestUrl(path: string, query?: string): string {
  const base = docUrl(path);
  return query ? `${base}?${query}` : base;
}

/** Yanıt metnini çağıranı bozmadan okur (gövde bir kez tüketilebilir). */
async function responseText(res: SbResponse): Promise<string> {
  try {
    return String(await res.text());
  } catch {
    return '';
  }
}

/** Red, kural/RLS kaynaklı mı (anahtar ya da token sorunu değil)? */
async function isRulesDenial(res: SbResponse): Promise<boolean> {
  const t = await responseText(res);
  return /row-level security|insufficient priv|permission denied|kural|not writable|admin-only|locked/i.test(t);
}

export type CloudFailure = {
  ok: false;
  error: string;
  code?: number;
  reason: 'denied' | 'offline' | 'notfound' | 'error';
};

export type CloudOutcome<T> = { ok: true; data: T } | CloudFailure;

/** Yanıt gövdesindeki KISA sebep (PostgREST `message`, SQL `raise exception`). */
function reasonOf(res?: SbResponse): string {
  const raw = String(res?.raw || '');
  if (!raw) return '';
  try {
    const j = JSON.parse(raw);
    const m = j?.message || j?.error?.message || j?.msg || (typeof j?.error === 'string' ? j.error : '') || j?.error_description || '';
    return String(m).replace(/\s+/g, ' ').trim().slice(0, 180);
  } catch {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 180);
  }
}

function classify(err: unknown, res?: SbResponse): CloudFailure {
  const msg = err == null ? '' : err instanceof Error ? err.message : String(err);
  if (res) {
    if (res.status === 404) return { ok: false, error: 'Kayıt bulunamadı', code: 404, reason: 'notfound' };
    if (res.status === 403 || res.status === 401) {
      const why = reasonOf(res);
      return {
        ok: false,
        code: res.status,
        reason: 'denied',
        // Neden yanıt gövdesinden gelir (PostgREST, `code: 42501` → HTTP 403);
        // burada hüküm uydurmuyoruz — çağıran taraf `denied` görürse o cümleyi gösterir.
        error:
          res.status === 401
            ? `Oturum token’ı kabul edilmedi (HTTP 401)${why ? ` — ${why}` : ''}.`
            : `Supabase bu işlemi kural (RLS) yüzünden gerçekleştirmedi (HTTP 403)${why ? `: ${why}` : '.'}`,
      };
    }
    if (res.status === 0) {
      return {
        ok: false,
        error: 'Supabase hedefi tanımlı değil — `npm run setup:supabase` gerekir.',
        reason: 'error',
      };
    }
    const why = reasonOf(res) || msg;
    return {
      ok: false,
      error:
        res.status >= 500
          ? `Supabase hata verdi (HTTP ${res.status})${why ? ` — ${why}` : ''}`
          : `Supabase HTTP ${res.status}${why ? ` — ${why}` : ''}`,
      code: res.status,
      reason: 'error',
    };
  }
  return {
    ok: false,
    error: `Ağ erişimi yok — Supabase’e ulaşılamadı${msg ? ` (${msg})` : ''}`,
    reason: 'offline',
  };
}

/* ---------------------------------------------------- belge/üye erişim yardımcıları */

/** Doğrudan belge okuma (zarf → FbValue); 404 = { ok: true, data: null }. */
export async function readDocEnvelope(
  path: string
): Promise<CloudOutcome<Record<string, FbValue> | null>> {
  try {
    const res = await request(docUrl(path));
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    return { ok: true, data: json?.fields || null };
  } catch (e) {
    return classify(e);
  }
}

/* -------------------------------------------------------------- documents */

export async function fetchMemberDoc(memberId: string): Promise<CloudOutcome<MemberDoc | null>> {
  try {
    const res = await request(docUrl(membersDocPath(memberId)));
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    if (!json?.fields) return { ok: true, data: null };
    return { ok: true, data: memberFromFields(json.fields, memberId) };
  } catch (e) {
    return classify(e);
  }
}

export async function fetchMemberByEmail(email: string): Promise<CloudOutcome<MemberDoc | null>> {
  const key = email.trim().toLocaleLowerCase('en-US');

  // Fast path: the document id *is* the normalized email, so a plain read works
  // and no index/scan is needed. The query below only covers documents created
  // outside the app (e.g. copied in from the old store with a random id).
  const direct = await fetchMemberDoc(key);
  if (direct.ok && direct.data) return direct;
  if (!direct.ok && direct.reason !== 'notfound') return direct;

  // Supabase'de belge kimliği kolonun kendisidir (`members.email`), dolayısıyla
  // tarama/`where` gerekmez: bulunamadıysa kayıt YOKTUR. Eski projeden kopyalanan
  // satırlar için `npm run migrate:supabase` kimliği e-postaya eşitler.
  if (!direct.ok) return direct;
  const exists = await memberExists(key);
  if (exists.ok && exists.data) {
    return {
      ok: false,
      error: 'Bu e-posta kayıtlı ama satırı beklenen biçimde değil — göçü tekrar çalıştır.',
      code: 200,
      reason: 'error',
    };
  }
  return { ok: true, data: null };
}

/** “Bu e-posta kayıtlı mı?” — tek boolean döner, hiçbir üye alanı sızmaz. */
export async function memberExists(email: string): Promise<CloudOutcome<boolean>> {
  const key = String(email || '').trim().toLowerCase();
  if (!key.includes('@')) return { ok: true, data: false };
  try {
    const res = await restFetch('rpc/kpss_member_exists', '', {
      method: 'POST',
      body: JSON.stringify({ p_email: key }),
    });
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    const value = Array.isArray(json) ? json[0] : json;
    return { ok: true, data: value?.exists === true || value === true };
  } catch (e) {
    return classify(e);
  }
}

export interface MemberListResult {
  members: MemberDoc[];
  /** true when the collection could not be listed (missing permission/does not exist) */
  limited: boolean;
  error?: string;
}

/** Paginated full listing of `memberships` — used by the admin panel. */
export async function listMembers(): Promise<MemberListResult> {
  const out: MemberDoc[] = [];
  let pageToken: string | undefined;
  try {
    // pageSize küçük: `memberships` kurallı her aday belge için meta/admins ve
    // meta/membership_lockdown okuma bütçesi harcıyor (query başına ~100 get/exists
    // limiti var). 30'luk sayfa = en kötü ~60 lookup; panel zaten sayfalıyor.
    for (let page = 0; page < 34; page++) {
      const q = new URLSearchParams({ pageSize: '30' });
      if (pageToken) q.set('pageToken', pageToken);
      const res = await request(`${docUrl(MEMBERSHIPS_COLLECTION)}?${q.toString()}`);
      if (res.status === 404) {
        return { members: [], limited: true, error: 'memberships koleksiyonu henüz yok' };
      }
      if (!res.ok) {
        return {
          members: out,
          limited: true,
          error: res.status === 403 ? 'Listeleme kuralı (rules.list) izin vermiyor' : `HTTP ${res.status}`,
        };
      }
      const json = await res.json();
      const docs = json?.documents || [];
      for (const doc of docs) {
        const id = String(doc.name || '').split('/').pop() || '';
        if (id) out.push(memberFromFields(doc.fields || {}, id));
      }
      pageToken = json?.nextPageToken;
      if (!pageToken) break;
    }
    return { members: out, limited: false };
  } catch (e) {
    return {
      members: out,
      limited: true,
      error: e instanceof Error ? e.message : 'offline',
    };
  }
}

/* ------------------------------------------- üyelik yazmaları (kural aynalı) */

/**
 * memberships yazmalarının tek kapısı. Gövde, SQL'deki `kpss_doc_keys_ok`
 * ve satır kısıtlarının TypeScript aynasından (`lib/memberShape.ts`) geçer:
 *   • düzeltilebilen sapmalar (bozuk/boş şifre demeti, 80 karakteri aşan ad,
 *     12'den çok kullanım girdisi, ondalık sayaç) YAZMADAN ÖNCE düzeltilir;
 *   • düzeltilemeyenden `create` reddedilir ve hangi ALANIN neden engellediği
 *     söylenir — "kural engelledi" bilmece olarak kalmaz.
 * `update` (PATCH) kısmi gövde olduğu için zorunlu alan listesi denetlenmez.
 */
function prepareMemberWrite(
  fields: Record<string, FbValue>,
  memberId: string,
  mode: 'create' | 'update'
): { ok: true; fields: Record<string, FbValue> } | { ok: false; error: string } {
  if (mode === 'update') {
    const patched = coerceMemberFields(fields, { memberId });
    const uid = patched.authUid?.stringValue;
    if ('authUid' in patched && (typeof uid !== 'string' || uid.length < 8))
      return { ok: false, error: 'Belge gönderilmedi — authUid: en az 8 karakter olmalı.' };
    return { ok: true, fields: patched };
  }
  const prepared = coerceMemberFields(fields, { memberId, fill: true });
  const problems = checkMemberFields(prepared, 'create', memberId);
  if (problems.length)
    return { ok: false, error: `Belge gönderilmedi — ${shapeProblemText(problems)}.` };
  return { ok: true, fields: prepared };
}

/** Kendi belgesine yazabilecek alanlar (rules: `usageOnlyChange`). */
const SELF_WRITABLE_KEYS = [
  'displayName',
  'city',
  'exam',
  'note',
  'testsCompleted',
  'questionsSolved',
  'netSum',
  'courseUsage',
  'lastLoginAt',
  'verifier',
  'salt',
  'iterations',
  'algo',
  'authUid',
] as const;

/** `memberToFields` çıktısından kısmi güncellemeye çevir (createdAt/e-posta yok). */
function selfPatchFromDraft(member: MemberDoc): Partial<MemberDoc> {
  const out: Record<string, unknown> = {};
  for (const key of SELF_WRITABLE_KEYS) {
    const value = (member as unknown as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  const bundle = member.password;
  if (bundle) {
    out.verifier = bundle.verifier;
    out.salt = bundle.salt;
    out.iterations = bundle.iterations;
    out.algo = bundle.algo;
  }
  return out as Partial<MemberDoc>;
}

export interface MemberWriteResult {
  outcome: CloudOutcome<MemberDoc>;
  /** Belge zaten vardı; kabul edilen alanlarla kısmi güncelleme yapıldı. */
  adopted?: boolean;
  /** Belge yoktu; tam biçimle create edilerek oluşturuldu (PATCH reddinin çözümü). */
  created?: boolean;
  /** create reddedildi, `usageOnlyChange` alanlarıyla yazılabildi. */
  degraded?: boolean;
}

/**
 * Üyelik belgesini yazmanın KADEMELİ yolu. Tek istekle başlar, reddi kendisi
 * çözer:
 *   1) POST ile tam biçim create
 *   2) 409 (belge var) → `usageOnlyChange` alanlarıyla PATCH → hesap benimsenir
 *   3) create reddi  → PATCH ile kısmi yazım (kural `hasAll`'ı create'de arar;
 *      PATCH belge YOKSA create'e döner ve eksik alanlardan reddedilir — bu
 *      yüzden 3. adımda önce belgenin var olup olmadığına bakılır)
 * Kullanıcı aynı hatayı iki kez görmez; başarısızlıkta son engelin kesin cümlesi döner.
 */
export async function writeMemberDoc(member: MemberDoc): Promise<MemberWriteResult> {
  const prepared = prepareMemberWrite(memberToFields(member), member.id, 'create');
  if (!prepared.ok) return { outcome: { ok: false, error: prepared.error, reason: 'error' } };

  const first = await postMemberDoc(member.id, prepared.fields);
  if (first.ok) return { outcome: first };

  // Belge zaten var → üzerine yazmak yerine kabul edilen alanları güncelle.
  if (first.code === 409) {
    const adopt = await patchMemberDoc(member.id, selfPatchFromDraft(member), {
      noCreateFallback: true,
    });
    if (adopt.ok) return { outcome: adopt, adopted: true };
    return { outcome: first };
  }

  // Create reddedildi: belge var mı? Varsa kısmi yazım kurala uyar (memberUpdateOk).
  const exists = await documentExists(`${MEMBERSHIPS_COLLECTION}/${member.id}`);
  if (exists === true) {
    const soft = await patchMemberDoc(member.id, selfPatchFromDraft(member), {
      noCreateFallback: true,
    });
    if (soft.ok) return { outcome: soft, degraded: true };
  }
  return { outcome: first };
}

async function postMemberDoc(
  memberId: string,
  fields: Record<string, FbValue>
): Promise<CloudOutcome<MemberDoc>> {
  const body = JSON.stringify({ fields });
  try {
    const res = await request(`${docUrl(MEMBERSHIPS_COLLECTION)}?documentId=${encodeURIComponent(memberId)}`, {
      method: 'POST',
      body,
    });
    if (res.status === 409)
      return {
        ok: false,
        error: 'Bu e-posta ile kayıtlı bir üye zaten var',
        code: 409,
        reason: 'error',
      };
    if (!res.ok) {
      // E-posta onayı açıkken kayıt anında henüz JWT oturumu yoktur (anon).
      // Eski kpss_write_doc içindeki ON CONFLICT DO UPDATE ifadesi Postgres'te
      // SELECT/UPDATE RLS politikalarını da tetiklediği için 403 dönebilir.
      // Saf INSERT (Prefer: return=minimal) ise yalnız members_self_insert ve
      // kpss_guard_member_write bekçisini çalıştırır ve pending satırı anında yazar.
      if (res.status === 403 && /row-level security.*members/i.test(res.raw || '')) {
        const emailLower = String(memberId).trim().toLowerCase();
        const plainRow: Record<string, unknown> = {
          ...fieldsToJson(fields),
          id: emailLower,
          email: emailLower,
          emailNormalized: emailLower,
          schemaVersion: 1,
        };
        const direct = await restFetch('members', '', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(plainRow),
        });
        if (direct.ok || direct.status === 201 || direct.status === 204) {
          return { ok: true, data: memberFromFields(fields, emailLower) };
        }
        return classify(undefined, direct);
      }
      return classify(undefined, res);
    }
    const json = await res.json();
    const id = String(json?.name || '').split('/').pop() || memberId;
    return { ok: true, data: memberFromFields(json?.fields || fields, id) };
  } catch (e) {
    return classify(e);
  }
}

/** Create a membership document (fails if the id already exists). */
export async function createMemberDoc(member: MemberDoc): Promise<CloudOutcome<MemberDoc>> {
  const prepared = prepareMemberWrite(memberToFields(member), member.id, 'create');
  if (!prepared.ok) return { ok: false, error: prepared.error, reason: 'error' };
  return postMemberDoc(member.id, prepared.fields);
}

/**
 * Üyelik yazmasının akış katmanı için kısayol: create reddilirse kendisi dener,
 * yine olmazsa tanının cümlesini taşıyan `denied` sonucu döner.
 */
export async function writeMembershipSelf(
  member: MemberDoc
): Promise<CloudOutcome<MemberDoc> & { adopted?: boolean; degraded?: boolean }> {
  const res = await writeMemberDoc(member);
  if (res.outcome.ok)
    return { ...res.outcome, ...(res.adopted ? { adopted: true } : {}), ...(res.degraded ? { degraded: true } : {}) };
  return { ...res.outcome, ...(res.degraded ? { degraded: true } : {}) };
}

/**
 * MemberDoc alanı → Supabase belge alanı eşlemesi. Türetilen alanlar birlikte
 * yazılır (ör. `email` → `id` + `emailNormalized`), yoksa rules'un `id == email`
 * denetimi yarım kalan güncellemelerde kırılır.
 */
const DERIVED_FIELDS: Record<string, string[]> = {
  email: ['id', 'emailNormalized'],
  password: ['verifier', 'salt', 'iterations', 'algo'],
};

/**
 * Kısmi güncellemede GÖNDERİLEMEYECEK alanlar:
 *   • `createdAt` — rules `memberUpdateOk` altında `usageOnlyChange`/`entitlementChange`
 *     listelerinde yok; gönderildiği an tüm PATCH reddedilir.
 *   • `email`     — belge kimliğidir; değişirse `data.id == data.email.lower()`
 *     denetimi düşer (yarı yolda belge yetimi oluşmaması için reddedilir).
 */
const PATCH_FORBIDDEN_KEYS = ['createdAt', 'id'];

/** rules `entitlementChange()` listesi — panelin tek seferde yazabildikleri. */
const ENTITLEMENT_KEYS = [
  'vip',
  'vipPlan',
  'vipExpiresAt',
  'status',
  'note',
  'displayName',
  'city',
  'exam',
  'lastLoginAt',
  'testsCompleted',
  'questionsSolved',
  'netSum',
  'courseUsage',
  'verifier',
  'salt',
  'iterations',
  'algo',
] as const;

/** Gerçek kısmi güncelleme: yalnızca istenen alanlar PATCH'lenir. */

export function memberPatchToFields(
  patch: Partial<MemberDoc>,
  memberId: string
): Record<string, FbValue> {
  const all = memberToFields({ ...emptyMember(memberId), ...patch, id: memberId } as MemberDoc);
  const out: Record<string, FbValue> = {};
  for (const key of Object.keys(patch)) {
    if (key === 'id' || PATCH_FORBIDDEN_KEYS.includes(key)) continue;
    if (patch[key as keyof MemberDoc] === undefined) continue;
    for (const field of [key, ...(DERIVED_FIELDS[key] || [])]) {
      if (field in all) out[field] = all[field];
    }
  }
  // `email` belge kimliğidir: kural `data.id == data.email.lower()` denetliyor,
  // yani farklı bir e-posta yazmak belgeyi yetim bırakır. Kimlik sabit kalır.
  if (out.email) {
    out.id = str(memberId);
    out.emailNormalized = str(memberId);
  }
  return out;
}

/** Supabase boş belge dönerse (REST bazı sürümlerde) kullanılan güvenli varsayılan. */
function emptyFieldsFor(memberId: string): Record<string, FbValue> {
  return { id: str(memberId), email: str(memberId), emailNormalized: str(memberId) };
}

/**
 * Merge-update of a membership document; only the given fields are touched.
 *
 * Kademeli davranış: belge YOKKEN gönderilen PATCH Supabase'da create'e döner
 * ve `memberShapeOk` yarım belgeyi reddeder. Reddi kullanıcıya yansıtmadan önce
 * aynı veriyle tam biçimli create denenir (`created: true` ile döner).
 */
export async function patchMemberDoc(
  memberId: string,
  member: Partial<MemberDoc>,
  opts: { noCreateFallback?: boolean } = {}
): Promise<CloudOutcome<MemberDoc>> {
  if (
    typeof member.email === 'string' &&
    member.email.trim() &&
    normalizeEmail(member.email) !== normalizeEmail(memberId)
  ) {
    return {
      ok: false,
      error:
        'Belgedeki e-posta güncellenmedi: üyelik kimliği e-postanın kendisidir (kural: `id == email`). E-posta değiştirmek yeni hesap açmak demek.',
      code: 400,
      reason: 'error',
    };
  }
  const fields = memberPatchToFields(member, memberId);
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'Güncellenecek alan yok', code: 400, reason: 'error' };
  }
  try {
    // updateMask göndermiyoruz: Supabase PATCH = verilen alanları birleştirir.
    const res = await request(docUrl(membersDocPath(memberId)), {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const denied = classify(undefined, res);
      if (!opts.noCreateFallback && (denied.reason === 'denied' || denied.code === 404)) {
        const full = { ...emptyMember(memberId), ...member, id: memberId } as MemberDoc;
        const prepared = prepareMemberWrite(memberToFields(full), memberId, 'create');
        if (prepared.ok) {
          const created = await postMemberDoc(memberId, prepared.fields);
          if (created.ok) return created;
        }
      }
      return denied;
    }
    const json = await res.json();
    const merged = json?.fields || {};
    return {
      ok: true,
      data: memberFromFields(
        Object.keys(merged).length ? merged : { ...emptyFieldsFor(memberId), ...fields },
        memberId
      ),
    };
  } catch (e) {
    const denied = classify(e);
    if (!opts.noCreateFallback && denied.reason === 'denied') {
      const full = { ...emptyMember(memberId), ...member, id: memberId } as MemberDoc;
      const prepared = prepareMemberWrite(memberToFields(full), memberId, 'create');
      if (prepared.ok) {
        const created = await postMemberDoc(memberId, prepared.fields);
        if (created.ok) return created;
      }
    }
    return denied;
  }
}

/**
 * Create-or-overwrite (PUT). Used by the admin panel so a VIP grant works even
 * when the local draft was never pushed to the cloud.
 */
export async function upsertMemberDoc(member: MemberDoc): Promise<CloudOutcome<MemberDoc>> {
  const full = { ...emptyMember(member.id), ...member, id: member.id } as MemberDoc;
  const exists = await documentExists(`${MEMBERSHIPS_COLLECTION}/${member.id}`);
  if (exists !== false) {
    // Belge var (ya da okunamadı): PUT tüm alanları yeniden yazardı ve kuralın
    // `memberUpdateOk` değişikliği kabul etmediği alanlar için yazmayı reddeder.
    // Yalnızca panelin dokunabildiği hak/durum alanları PATCH'lenir.
    const patch: Partial<MemberDoc> = {};
    for (const key of ENTITLEMENT_KEYS) {
      const value = (full as unknown as Record<string, unknown>)[key];
      if (value !== undefined) (patch as unknown as Record<string, unknown>)[key] = value;
    }
    if (full.authUid) {
      // `authUid` yalnızca usageOnlyChange listesinde: hak alanlarıyla birlikte
      // gönderilirse iki liste de tutmaz → o alanı ayrıca, tek PATCH'te yaz.
      await patchMemberDoc(member.id, { authUid: full.authUid }, { noCreateFallback: true }).catch(
        () => undefined
      );
    }
    const patched = await patchMemberDoc(member.id, patch, { noCreateFallback: true });
    if (patched.ok || Object.keys(patch).length === 0) return patched;
  }
  const prepared = prepareMemberWrite(memberToFields(full), member.id, 'create');
  if (!prepared.ok) return { ok: false, error: prepared.error, reason: 'error' };
  const created = await postMemberDoc(member.id, prepared.fields);
  return created.ok || created.code !== 409 ? created : patchedOr(created, member);
}

/** create 409 ile dönerse belge zaten vardır: kısmi yazım yine de denenir. */
async function patchedOr(
  failed: CloudOutcome<MemberDoc>,
  member: MemberDoc
): Promise<CloudOutcome<MemberDoc>> {
  const patch: Partial<MemberDoc> = {};
  for (const key of ENTITLEMENT_KEYS) {
    const value = (member as unknown as Record<string, unknown>)[key];
    if (value !== undefined) (patch as unknown as Record<string, unknown>)[key] = value;
  }
  const res = await patchMemberDoc(member.id, patch, { noCreateFallback: true });
  return res.ok ? res : failed;
}

export async function deleteMemberDoc(memberId: string): Promise<CloudOutcome<true>> {
  try {
    const res = await request(docUrl(membersDocPath(memberId)), { method: 'DELETE' });
    if (res.status === 404) return { ok: true, data: true };
    if (!res.ok) return classify(undefined, res);
    return { ok: true, data: true };
  } catch (e) {
    return classify(e);
  }
}

/** Lightweight reachability probe used to banner "offline" state in the panel. */
/* --------------------------------------------------- generic documents */

/** Create-or-overwrite any document inside the configured content root. */
export async function putDocument(
  path: string,
  fields: Record<string, FbValue>
): Promise<CloudOutcome<true>> {
  try {
    const res = await request(docUrl(path), {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return classify(undefined, res);
    return { ok: true, data: true };
  } catch (e) {
    return classify(e);
  }
}

export async function deleteDocument(path: string): Promise<CloudOutcome<true>> {
  try {
    const res = await request(docUrl(path), { method: 'DELETE' });
    if (res.status === 404) return { ok: true, data: true };
    if (!res.ok) return classify(undefined, res);
    return { ok: true, data: true };
  } catch (e) {
    return classify(e);
  }
}

/** true = belge var, false = yok, null = okunamadı (rules/ağ). */
export async function documentExists(path: string): Promise<boolean | null> {
  try {
    const res = await request(docUrl(path));
    if (res.ok) return true;
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Koleksiyon listeleme: `{documents: [{name, fields}], nextPageToken}`.
 * Sayfa boyutu küçük tutulur; `kpss_list_docs` bekçi/RLS denetiminden geçer.
 */
export async function listDocuments(
  path: string,
  opts: { pageSize?: number } = {}
): Promise<CloudOutcome<{ name: string; fields: Record<string, FbValue> }[]>> {
  const docs: { name: string; fields: Record<string, FbValue> }[] = [];
  let pageToken: string | undefined;
  try {
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ pageSize: String(opts.pageSize || 100) });
      if (pageToken) q.set('pageToken', pageToken);
      const res = await request(`${docUrl(path)}?${q.toString()}`);
      if (res.status === 404) return { ok: true, data: docs };
      if (!res.ok) return classify(undefined, res);
      const json = await res.json();
      for (const doc of json?.documents || []) {
        docs.push({ name: String(doc?.name || ''), fields: doc?.fields || {} });
      }
      pageToken = json?.nextPageToken;
      if (!pageToken) break;
    }
    return { ok: true, data: docs };
  } catch (e) {
    return classify(e);
  }
}

/** Read a raw document's `fields` object (null when missing). */
export async function readDocument(
  path: string
): Promise<CloudOutcome<Record<string, FbValue> | null>> {
  try {
    const res = await request(docUrl(path));
    if (res.status === 404) return { ok: true, data: null };
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    return { ok: true, data: json?.fields || null };
  } catch (e) {
    return classify(e);
  }
}

export async function probeCloud(): Promise<{ online: boolean; error?: string }> {
  try {
    const res = await request(`${docUrl(MEMBERSHIPS_COLLECTION)}?pageSize=1`);
    if (res.ok) return { online: true };
    if (res.status === 404) return { online: true }; // reachable, collection missing
    const err = classify(undefined, res);
    return { online: false, error: 'error' in err ? err.error : 'unknown' };
  } catch (e) {
    return { online: false, error: e instanceof Error ? e.message : 'offline' };
  }
}

export type { MembershipStatus, VipPlanId };

/* -------------------------------------------------- yönetici listesi (meta) */

/**
 * Kurallar `meta` belgelerinde İKİ yolu da denetliyor:
 *   `meta/…` (yeni, kök düzen)  ve  `artifacts/kpss-asistani/public/data/meta/…`
 * (legacy düzen — `lockdownOn()` ve `isAdminSession()` öyle yazıldı). Eski
 * projeden taşınan bir `membership_lockdown` belgesi yalnız legacy yolda duruyorsa
 * TEK yol bakışı "kilit yok" der, oysa kurallar kilitli sayar → tüm üyelik
 * yazmaları sebepsiz reddedilmiş gibi görünür. Bu yüzden istemci de iki yolu görür.
 */
/**
 * Supabase'de tek yerleşim düzeni vardır (`public` şeması): eski Supabase
 * "legacy artifacts yolu" ikiliği bitti. `metaDocPaths()` arayüzü korunur ki
 * panel/kilitle okuyan taraflar aynı kalsın.
 */
export const LEGACY_ARTIFACTS_ROOT = '';

/** Denetlenmesi gereken tam belge yolları (tek düzen → tek yol). */
export function metaDocPaths(name: string): string[] {
  return [collectionPath(name)];
}

/** Panelde gösterilecek birincil yol. */
export const ADMINS_DOC_PATH = collectionPath('meta/admins');
/** `meta/membership_lockdown` varlığı = üyelik işlemlerinde token zorunlu. */
export const MEMBERSHIP_LOCKDOWN_DOC_PATH = collectionPath('meta/membership_lockdown');

/** Kilit durumu + HANGİ yolda durduğu (Panel + tanı bunu gösterir). */
export interface LockdownInfo {
  on: boolean;
  /** Kilidi açmak için Console'dan silinmesi gereken belge yolu. */
  path: string | null;
  /** Kilide ulaşılıp ulaşılamadığı (kural/ağ) — `on` bilinmiyorsa true. */
  unreadable: boolean;
  checked: string[];
}

export async function readLockdownInfo(): Promise<LockdownInfo> {
  const checked = metaDocPaths('meta/membership_lockdown');
  const flags = await Promise.all(checked.map(path => documentExists(path)));
  const index = flags.findIndex(f => f === true);
  if (index >= 0)
    return { on: true, path: checked[index], unreadable: false, checked };
  return {
    on: false,
    path: null,
    unreadable: flags.some(f => f === null),
    checked,
  };
}

function emailsOf(fields: Record<string, FbValue> | null): string[] {
  const values = (fields?.emails as any)?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  return values
    .map((v: any) => String(v?.stringValue ?? ''))
    .filter(e => !!e)
    .map(e => e.toLowerCase());
}

/**
 * Panel/yönetici listesi: boş dizi = belge yok. Kurallar iki yolu da okuduğu için
 * listelerin BİRLEŞİMİ alınır (legacy yolda kalmış bir e-posta yöneticiliği boşa
 * düşmesin); yazma her zaman birincil yola yapılır.
 */
export async function readAdminList(): Promise<CloudOutcome<{ emails: string[]; exists: boolean }>> {
  const paths = metaDocPaths('meta/admins');
  const docs = await Promise.all(paths.map(path => readDocument(path)));
  const failed = docs.find(d => !d.ok);
  // Tamamı okunamadıysa hatayı ilet; bir kısmı okunabildiyse elimizdekiyle devam.
  if (failed && !docs.some(d => d.ok)) return failed;
  const emails: string[] = [];
  let exists = false;
  for (const d of docs) {
    if (!d.ok || !d.data) continue;
    exists = true;
    for (const e of emailsOf(d.data)) if (!emails.includes(e)) emails.push(e);
  }
  return { ok: true, data: { emails, exists } };
}

/**
 * E-postayı yönetici listesine ekler (idempotent).
 * Kurallar bu yazmaya yalnızca içerik/kilit penceresi açıkken izin verir;
 * `meta/membership_lockdown` oluşturulduktan sonra liste Console'dan yönetilir.
 */
export async function addAdminEmail(
  email: string,
  opts?: { replace?: boolean }
): Promise<CloudOutcome<string[]>> {
  const wanted = normalizeEmail(email);
  if (!wanted.includes('@')) return { ok: false, error: 'Geçerli bir e-posta gir.', reason: 'error' };
  const current = await readAdminList();
  if (!current.ok) return current;
  const emails = opts?.replace ? [] : [...current.data.emails];
  if (!emails.includes(wanted)) emails.push(wanted);
  if (emails.length > 10)
    return { ok: false, error: 'Yönetici listesi en fazla 10 e-posta tutar.', reason: 'error' };
  const res = await putDocument(ADMINS_DOC_PATH, {
    emails: arr(emails.map(e => str(e))),
    updatedAt: str(new Date().toISOString()),
    schemaVersion: int(1),
  });
  if (!res.ok) {
    // Kilit açıksa bu yazmaya hiçbir kural izin vermez: silinecek belgeyi söyle.
    const lock = await readLockdownInfo();
    if (lock.on && lock.path)
      return {
        ok: false,
        reason: 'denied',
        error: `Yönetici listesi yazılamadı: üyelik kilidi AÇIK (${lock.path} belgesi var). Önce Console → Supabase → Documents → ${lock.path} belgesini sil, listeyi güncelle, sonra istersen kilidi tekrar aç.`,
      };
    return res;
  }
  return { ok: true, data: emails };
}

/** Üyelik kilidi açık mı? (true → kimliksiz istemciler üyelik yazamaz) */
export async function readMembershipLockdown(): Promise<CloudOutcome<boolean>> {
  try {
    const info = await readLockdownInfo();
    if (info.unreadable)
      return { ok: false, error: 'Kilit durumu okunamadı (ağ/kural).', reason: 'offline' };
    return { ok: true, data: info.on };
  } catch (e) {
    return classify(e);
  }
}
