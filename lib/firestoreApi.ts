/**
 * Firestore REST client for membership data (read + write).
 *
 * Everything about membership lives in Firestore under
 * `artifacts/kpss-asistani/public/data/memberships/{memberId}` so the admin panel,
 * the app and any other device share one source of truth.
 *
 * The same `FIRESTORE_PUBLIC_BASE` that already serves content is used for writes,
 * which means the project's security rules must allow writes on `memberships`
 * (see firestore.rules at the repo root).
 */
import {
  MemberDoc,
  MembershipStatus,
  VipPlanId,
  emptyMember,
  memberFromFields,
  memberToFields,
} from './membership';

import {
  MEMBERSHIPS_COLLECTION_NAME,
  collectionPath,
  documentsBase,
  firestoreTarget,
} from './firebaseConfig';

/** Çözümlenmiş hedef (panelde gösterilir; lib/firebaseConfig.ts tek kaynak). */
export const FIRESTORE_TARGET = firestoreTarget();
export const FIRESTORE_PROJECT = FIRESTORE_TARGET.projectId;
export const FIRESTORE_DATABASE = FIRESTORE_TARGET.databaseId;
export const MEMBERSHIPS_COLLECTION = collectionPath(MEMBERSHIPS_COLLECTION_NAME);

const DOCUMENTS_BASE = documentsBase(FIRESTORE_TARGET);

const docUrl = (docPath: string) => `${DOCUMENTS_BASE}/${docPath}`;
const membersDocUrl = (memberId: string) =>
  `${docUrl(`${MEMBERSHIPS_COLLECTION}/${encodeURIComponent(memberId)}`)}`;

/* ------------------------------------------------------------ value types */

export type FbValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields: Record<string, FbValue> } }
  | { arrayValue: { values: FbValue[] } };

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

async function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...((init?.headers as object) || {}) },
  });
}

export type CloudOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: number; reason: 'denied' | 'offline' | 'notfound' | 'error' };

function classify(err: unknown, res?: Response): CloudOutcome<never> {
  const msg = err instanceof Error ? err.message : String(err);
  if (res) {
    if (res.status === 404) return { ok: false, error: 'Kayıt bulunamadı', code: 404, reason: 'notfound' };
    if (res.status === 403 || res.status === 401)
      return {
        ok: false,
        code: res.status,
        reason: 'denied',
        error:
          'Firestore kurallı yazmayı reddetti. firestore.rules dosyasındaki örneği konsoldan yayınla (memberships izni).',
      };
    return {
      ok: false,
      error:
        res.status >= 500
          ? `Firestore sunucusu hata verdi (HTTP ${res.status})${msg ? ` — ${msg}` : ''}`
          : `Firestore HTTP ${res.status}${msg ? ` — ${msg}` : ''}`,
      code: res.status,
      reason: 'error',
    };
  }
  return {
    ok: false,
    error: `Ağ erişimi yok — Firestore’una ulaşılamadı${msg ? ` (${msg})` : ''}`,
    reason: 'offline',
  };
}

/* -------------------------------------------------------------- documents */

export async function fetchMemberDoc(memberId: string): Promise<CloudOutcome<MemberDoc | null>> {
  try {
    const res = await request(membersDocUrl(memberId));
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

  const q = [
    `orderBy=fields.emailNormalized`,
    `where=fields.emailNormalized,${encodeURIComponent('==')},${encodeURIComponent(`"${key}"`)}`,
    `limit=1`,
  ].join('&');
  try {
    const res = await request(`${docUrl(MEMBERSHIPS_COLLECTION)}?${q}`);
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    const doc = (json?.documents || [])[0];
    if (!doc) return { ok: true, data: null };
    const id = String(doc.name || '').split('/').pop() || key;
    return { ok: true, data: memberFromFields(doc.fields || {}, id) };
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
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({ pageSize: '300' });
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

/** Create a membership document (fails if the id already exists). */
export async function createMemberDoc(member: MemberDoc): Promise<CloudOutcome<MemberDoc>> {
  const body = JSON.stringify({
    fields: memberToFields(member),
  });
  try {
    const res = await request(`${docUrl(MEMBERSHIPS_COLLECTION)}?documentId=${encodeURIComponent(member.id)}`, {
      method: 'POST',
      body,
    });
    if (res.status === 409) return classify(new Error('exists'), undefined);
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    const id = String(json?.name || '').split('/').pop() || member.id;
    return { ok: true, data: memberFromFields(json?.fields || memberToFields(member), id) };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (/exists/i.test(err.message))
      return { ok: false, error: 'Bu e-posta ile kayıtlı bir üye zaten var', code: 409, reason: 'error' };
    return classify(err);
  }
}

/**
 * MemberDoc alanı → Firestore belge alanı eşlemesi. Türetilen alanlar birlikte
 * yazılır (ör. `email` → `id` + `emailNormalized`), yoksa rules'un `id == email`
 * denetimi yarım kalan güncellemelerde kırılır.
 */
const DERIVED_FIELDS: Record<string, string[]> = {
  email: ['id', 'emailNormalized'],
  password: ['verifier', 'salt', 'iterations', 'algo'],
};

/** Gerçek kısmi güncelleme: yalnızca istenen alanlar PATCH'lenir. */
export function memberPatchToFields(
  patch: Partial<MemberDoc>,
  memberId: string
): Record<string, FbValue> {
  const all = memberToFields({ ...emptyMember(memberId), ...patch, id: memberId } as MemberDoc);
  const out: Record<string, FbValue> = {};
  for (const key of Object.keys(patch)) {
    if (key === 'id') continue;
    if (patch[key as keyof MemberDoc] === undefined) continue;
    for (const field of [key, ...(DERIVED_FIELDS[key] || [])]) {
      if (field in all) out[field] = all[field];
    }
  }
  // `email` geldiyse belge kimliğiyle tutarlılığı garanti et.
  if (out.email) {
    out.id = str(memberId);
    out.emailNormalized = str(memberId);
  }
  return out;
}

/** Firestore boş belge dönerse (REST bazı sürümlerde) kullanılan güvenli varsayılan. */
function emptyFieldsFor(memberId: string): Record<string, FbValue> {
  return { id: str(memberId), email: str(memberId), emailNormalized: str(memberId) };
}

/** Merge-update of a membership document; only the given fields are touched. */
export async function patchMemberDoc(
  memberId: string,
  member: Partial<MemberDoc>
): Promise<CloudOutcome<MemberDoc>> {
  const fields = memberPatchToFields(member, memberId);
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'Güncellenecek alan yok', code: 400, reason: 'error' };
  }
  try {
    // updateMask göndermiyoruz: Firestore PATCH = verilen alanları birleştirir.
    const res = await request(membersDocUrl(memberId), {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return classify(undefined, res);
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
    return classify(e);
  }
}

/**
 * Create-or-overwrite (PUT). Used by the admin panel so a VIP grant works even
 * when the local draft was never pushed to the cloud.
 */
export async function upsertMemberDoc(member: MemberDoc): Promise<CloudOutcome<MemberDoc>> {
  const body = JSON.stringify({ fields: memberToFields({ ...emptyMember(member.id), ...member }) });
  try {
    const res = await request(membersDocUrl(member.id), { method: 'PUT', body });
    if (!res.ok) return classify(undefined, res);
    const json = await res.json();
    return { ok: true, data: memberFromFields(json?.fields || {}, member.id) };
  } catch (e) {
    return classify(e);
  }
}

export async function deleteMemberDoc(memberId: string): Promise<CloudOutcome<true>> {
  try {
    const res = await request(membersDocUrl(memberId), { method: 'DELETE' });
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
