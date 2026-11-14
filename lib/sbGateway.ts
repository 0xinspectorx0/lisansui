/**
 * Supabase geçidi — uygulamanın bulutla konuştuğu tek yer.
 *
 * Uygulama hâlâ “belge” diliyle konuşur (`memberships/{e-posta}`,
 * `courses/{c}/topics/{t}`, `daily_tips/main`, `meta/membership_policy`), ama
 * arkada Supabase YOK: her istek Supabase'deki RPC'ye gider
 * (`/rest/v1/rpc/kpss_read_doc | kpss_write_doc | kpss_delete_doc | kpss_list_docs`)
 * ve Postgres onu İLİŞKİSEL tabloların satırlarına dağıtır — konu belgesinin
 * `questions` dizisi `questions` tablosunda satır satır durur. Yetki denetimi de
 * orada: RLS + yazma bekçileri (supabase/migrations/0001_init.sql).
 *
 * Neden zarf (envelope) dönüştürme var? Uygulamanın geri kalanı `FbValue`
 * biçimini kullanıyor (`str/int/bool/arr/fbMap`, `memberFromFields`,
 * `decodePolicy`). Tablolar düz JSON tutar; dönüşüm yalnız burada, tek yerde.
 *
 * Hata davranışı sözleşmesi (test:db bunu kilitler):
 *   • 42501 / “row-level security” / “insufficient privilege” → reason: 'denied'
 *   • 404 / NOT_FOUND                                            → reason: 'notfound'
 *   • ağ hatası                                                   → reason: 'offline'
 *   • bayat JWT → token ZORLA tazelenip aynı istek bir kez daha denenir
 *     (`consumeTokenRefreshNotice()`); kullanıcıya “yeniden dene” denmez.
 * Kuyruk yok, bekletme yok, `setTimeout` yok: yazma ya gider ya da reddedilir.
 */

import { cloudTarget, isCloudConfigured, restBase } from './supabaseConfig';
import * as auth from './authClient';

/* ----------------------------------------------------------- FbValue zarfı */

export type SbValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values: SbValue[] } }
  | { mapValue: { fields: Record<string, SbValue> } };

/** Supabase-biçimli zarfı düz JSON'a çevirir (Postgres `jsonb_populate_record`). */
export function fieldsToJson(fields: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = valueToJson(v);
  return out;
}

function valueToJson(v: any): any {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if ('stringValue' in v) return String(v.stringValue ?? '');
  if ('integerValue' in v) return Number(v.integerValue ?? 0);
  if ('doubleValue' in v) return Number(v.doubleValue ?? 0);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(valueToJson);
  if (v.mapValue) return fieldsToJson(v.mapValue.fields);
  return null;
}

/** Düz JSON'u uygulamanın beklediği zarfa çevirir (`readStr/readNum` uyumu). */
export function jsonToFields(doc: Record<string, any> | null | undefined): Record<string, SbValue> {
  const out: Record<string, SbValue> = {};
  for (const [k, v] of Object.entries(doc || {})) out[k] = valueToField(v);
  return out;
}

function valueToField(v: any): SbValue {
  if (v === null || v === undefined) return { nullValue: null };
  const t = typeof v;
  if (t === 'string') return { stringValue: v };
  if (t === 'boolean') return { booleanValue: v };
  if (t === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valueToField) } };
  if (t === 'object') return { mapValue: { fields: jsonToFields(v) } };
  return { stringValue: String(v) };
}

/* ------------------------------------------------------------ fetch zarfı */

/** Eski `fetch` yanıtının burada ihtiyaç duyulan alt kümesi. */
export interface SbResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
  clone?: () => { text: () => Promise<string> };
  /** Ham yanıt metni — hata sebebini senkron okumak için (tekrar istek ATMAZ). */
  raw?: string;
}

function wrap(status: number, body: any, raw?: string): SbResponse {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (body !== undefined ? body : text ? JSON.parse(text) : {}),
    text: async () => text,
    clone: () => ({ text: async () => text }),
    raw: text,
  };
}

/* ------------------------------------------------------------ oturum & uyarılar */

const TOKEN_STALE_HINT =
  /JWT expired|invalid_jwt|expired|Invalid Credential|TOKEN_EXPIRED|AUTHENTICATION_FAILED|auth failure/i;

let tokenRefreshNotice = false;
/** Token yenileyip yeniden denedi mi? (bir kez bildirilir, sonra sıfırlanır.) */
export function consumeTokenRefreshNotice(): boolean {
  const v = tokenRefreshNotice;
  tokenRefreshNotice = false;
  return v;
}

let foreignTokenNotice = false;
export function consumedForeignTokenNotice(): boolean {
  const v = foreignTokenNotice;
  foreignTokenNotice = false;
  return v;
}

async function authHeaders(opts: { forceRefresh?: boolean } = {}): Promise<Record<string, string>> {
  try {
    const token = await auth.currentAccessToken(opts);
    if (!token) return {};
    // Token başka bir Supabase projesinden ise (cihazda kalmış eski kurulum) HİÇ
    // göndermeyiz: yanlış token her isteği 401'e çevirir, kimliksiz istek ise
    // kilitsiz kurulumda çalışmaya devam eder.
    if (await auth.isForeignSessionToken()) {
      foreignTokenNotice = true;
      return {};
    }
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

/* --------------------------------------------------------------- RPC kapısı */

type RpcName = 'kpss_read_doc' | 'kpss_write_doc' | 'kpss_delete_doc' | 'kpss_list_docs' | 'kpss_member_exists';

/**
 * Tek RPC çağrısı. Postgres'in FIRLATTIĞI yetki redleri (errcode 42501) ve
 * PostgREST'in kendi redleri (PGRST301) burada HTTP anlamına çevrilir.
 */
async function rpc(
  name: RpcName,
  args: Record<string, any>,
  prefer?: string
): Promise<SbResponse> {
  const target = cloudTarget();
  if (!isCloudConfigured(target)) {
    return wrap(0, undefined, 'Supabase hedefi tanımlı değil');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: target.anonKey,
    Accept: 'application/json',
    ...(await authHeaders()),
    ...(prefer ? { Prefer: prefer } : {}),
  };
  const url = `${restBase(target)}/rpc/${name}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(args) });
  const raw = await safeText(res);
  const body = safeJson(raw);
  const status = mapStatus(res.status, body);
  return wrap(status, unwrap(body, status), raw);
}

/** PostgREST/Postgres hata kodları → HTTP anlamı (çağıranlar status okur). */
function mapStatus(http: number, body: any): number {
  const code = String(body?.code ?? body?.error?.code ?? body?.pg_code ?? '');
  const message = String(body?.message ?? body?.error?.message ?? '');
  // SQL tarafı zarf içinde durum taşır (`{status:404,…}`) ve PostgREST bunu HTTP 200
  // ile dönebilir. Bunu yok saymak “okundu/yazıldı” sanılan sessiz başarısızlık
  // üretir — bu yüzden zarfın durumu HTTP anlamına da yazılır.
  const envelope = Number(body?.status);
  if (http < 400 && Number.isFinite(envelope) && envelope >= 400) return envelope;
  if (http === 404) return 404;
  if (code === '42501' || code === 'PGRST301' || /row-level security|insufficient priv|permission denied/i.test(message)) {
    return 403;
  }
  if (code === 'PGRST116' || /no rows|NOT_FOUND/i.test(message)) return 404;
  if (http >= 400) return http;
  return 200;
}

/** RPC zarfı `{status, …}` döndürür; yoksa Ham yanıtı geçiririz. */
function unwrap(body: any, status: number): any {
  if (body && typeof body === 'object' && typeof body.status === 'number' && (body.fields || body.documents || body.error || body.name)) {
    return { ...body, status: body.status ?? status };
  }
  if (body && typeof body === 'object' && status === 200 && !Array.isArray(body) && ('fields' in body || 'documents' in body)) {
    return { status: 200, ...body };
  }
  return Array.isArray(body) ? body : { status, body };
}

async function safeText(res: any): Promise<string> {
  try {
    return String(await res.text?.());
  } catch {
    return '';
  }
}

function safeJson(raw: string): any {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw.slice(0, 300) };
  }
}

/* -------------------------------------------------- belge yolu → RPC eşlemesi */

/** Eski REST URL biçimi; yalnız `request()` bunu çözer (çağıranlar yol üretir). */
export function docUrl(path: string): string {
  return `${restBase(cloudTarget())}/documents/${path}`;
}

export function documentsBase(target = cloudTarget()): string {
  return `${restBase(target)}/documents`;
}

/** `collection` + `id` → `collection/id` (aynı kimlik iki kez yazılmez). */
function joinDoc(collection: string, id: string): string {
  const clean = decodeURIComponent(String(id || ''));
  if (!clean || clean.includes('/')) return collection;
  return collection.endsWith(`/${clean}`) ? collection : `${collection}/${clean}`;
}

function parseDocUrl(url: string): { path: string; query: URLParams } | null {
  const marker = '/documents/';
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const rest = url.slice(at + marker.length);
  const qIndex = rest.indexOf('?');
  const path = decodeURIComponent(qIndex < 0 ? rest : rest.slice(0, qIndex));
  return { path, query: parseQuery(qIndex < 0 ? '' : rest.slice(qIndex + 1)) };
}

interface URLParams {
  pageSize?: number;
  pageToken?: string;
  mask: string[];
  /** `?documentId=…` — koleksiyona yazarken belgenin kendi kimliği. */
  documentId?: string;
}

function parseQuery(q: string): URLParams {
  const mask: string[] = [];
  let pageSize: number | undefined;
  let pageToken: string | undefined;
  let documentId: string | undefined;
  for (const part of q.split('&').filter(Boolean)) {
    const [k, v = ''] = part.split('=');
    const key = decodeURIComponent(k);
    const val = decodeURIComponent(v);
    if (key === 'updateMask.fieldPaths') mask.push(val);
    else if (key === 'pageSize') pageSize = Number(val) || undefined;
    else if (key === 'pageToken') pageToken = val;
    else if (key === 'documentId') documentId = val;
  }
  return { pageSize, pageToken, mask, documentId };
}

const LISTABLE = /(^|\/)(topics|memberships|courses)$/;

/**
 * cloudApi'nin tek transport noktası. `docUrl()` ile üretilen her URL bir Supabase
 * RPC'sine çevrilir; belge semantiği (create/patch/list/get) olduğu gibi kalır.
 */
export async function request(url: string, init?: RequestInit): Promise<SbResponse> {
  const parsed = parseDocUrl(url);
  if (!parsed) {
    // Belgeler dışı çağrılar (ör. erişim yoklaması) → RPC'ye değil, doğrudan fetch.
    const target = cloudTarget();
    if (!isCloudConfigured(target)) return wrap(0, undefined, 'Supabase hedefi tanımlı değil');
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: target.anonKey,
        ...((init?.headers as object) || {}),
        ...(await authHeaders()),
      },
    });
    return wrap(res.status, undefined, await safeText(res));
  }

  const { query } = parsed;
  const method = String(init?.method || 'GET').toUpperCase();
  // Koleksiyon + documentId = belge yolu (eski REST’in “create with id” biçimi).
  // Bu çözülmezse yazı `memberships` gibi bir dizine gider ve SQL yolu tanımaz.
  const path = query.documentId ? joinDoc(parsed.path, query.documentId) : parsed.path;
  const body = typeof init?.body === 'string' ? safeJson(init.body) : undefined;
  const fields: Record<string, any> = body?.fields || {};

  if (method === 'GET' && LISTABLE.test(path)) {
    const res = await rpc('kpss_list_docs', {
      p_prefix: path,
      p_page_size: query.pageSize || 100,
      p_page_token: query.pageToken || '',
    });
    return normalizeList(res);
  }
  if (method === 'GET') {
    const res = await rpc('kpss_read_doc', { p_path: path });
    return normalizeRead(res, path);
  }
  if (method === 'DELETE') {
    return rpc('kpss_delete_doc', { p_path: path }, 'return=minimal');
  }

  // PUT = tam belge, PATCH = masked alanlarla kısmi güncelleme (eski PATCH).
  const doc = fieldsToJson(fields);
  const masked =
    method === 'PATCH' && query.mask.length
      ? Object.fromEntries(query.mask.map(k => [k, doc[k]]).filter(([, v]) => v !== undefined))
      : doc;
  const res = await rpc('kpss_write_doc', { p_path: path, p_doc: masked, p_mode: method === 'PATCH' ? 'merge' : 'replace' });
  return withTokenHeal(res, async () => {
    const fresh = await authHeaders({ forceRefresh: true });
    if (!fresh.Authorization) return null;
    const retry = await rpc('kpss_write_doc', { p_path: path, p_doc: masked, p_mode: method === 'PATCH' ? 'merge' : 'replace' });
    return retry.status === 401 || retry.status === 403 ? null : retry;
  });
}

/** Bayat JWT 401/403 üretirse: token'ı tazele, tek sefer tekrarla (sessiz kendine iyi). */
async function withTokenHeal(res: SbResponse, again: () => Promise<SbResponse | null>): Promise<SbResponse> {
  if (res.ok || res.status !== 401) return res;
  try {
    const hinted = /JWT expired|invalid_jwt|expired/i.test(await res.text());
    if (!hinted) return res;
    const retry = await again();
    if (retry && retry.ok) {
      tokenRefreshNotice = true;
      return retry;
    }
  } catch {
    /* ilk yanıtı döndürürüz */
  }
  return res;
}

function normalizeRead(res: SbResponse, path: string): SbResponse {
  const original = res.json;
  return {
    ...res,
    json: async () => {
      const body = await original();
      if (body?.status === 404) return { status: 404, error: 'NOT_FOUND' };
      const fields = body?.fields ?? body?.body ?? null;
      return { name: path, fields: fields ? jsonToFields(fields) : undefined };
    },
  };
}

function normalizeList(res: SbResponse): SbResponse {
  const original = res.json;
  return {
    ...res,
    json: async () => {
      const body = await original();
      const docs = Array.isArray(body?.documents)
        ? body.documents
        : Array.isArray(body)
          ? body
          : [];
      return {
        documents: docs.map((d: any) => ({
          name: d?.name ?? '',
          fields: d?.fields ? jsonToFields(d.fields) : undefined,
        })),
        nextPageToken: body?.nextPageToken ?? '',
      };
    },
  };
}

/** Düz REST (user_data / user_tests) için küçük PostgREST istemcisi. */
export async function restFetch(
  table: string,
  query: string,
  init?: RequestInit
): Promise<SbResponse> {
  const target = cloudTarget();
  if (!isCloudConfigured(target)) return wrap(0, undefined, 'Supabase hedefi tanımlı değil');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: target.anonKey,
    Accept: 'application/json',
    ...((init?.headers as object) || {}),
    ...(await authHeaders()),
  };
  const res = await fetch(`${restBase(target)}/${table}?${query}`, {
    ...init,
    headers,
  });
  const raw = await safeText(res);
  return wrap(mapStatus(res.status, safeJson(raw)), safeJson(raw), raw);
}

/** Erişilebilirlik yoklaması: RPC'ye dokunmadan “anahtar var mı” cevabı. */
export function isReachableConfigured(): boolean {
  return isCloudConfigured(cloudTarget());
}
