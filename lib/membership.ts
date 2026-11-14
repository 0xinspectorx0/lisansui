/**
 * Membership domain model + quota rules.
 *
 * A member is a single Supabase document; the app, the admin panel and every
 * other device read the same document, which is what makes VIP state and the
 * "1 free test per course" limit enforceable across installs.
 */
import { TestResult, TopicMeta } from './types';
import { coerceMemberFields } from './memberShape';

export type VipPlanId = 'free' | 'monthly' | 'yearly' | 'lifetime';
export type MembershipStatus = 'active' | 'suspended' | 'banned' | 'pending';
export type MemberRole = 'user' | 'editor' | 'admin' | 'owner';

export interface MemberDoc {
  id: string;
  email: string;
  emailNormalized: string;
  displayName: string;
  password: { verifier: string; salt: string; iterations: number; algo: string };
  /** Supabase Auth uid'si (depoda config/supabaseApp.ts içinde anahtar varsa doldurulur). */
  authUid?: string;
  role: MemberRole;
  status: MembershipStatus;
  vip: boolean;
  vipPlan: VipPlanId;
  /** yyyy-mm-dd, empty string = no expiry (lifetime) */
  vipExpiresAt: string;
  createdAt: string;
  lastLoginAt: string;
  city: string;
  exam: string;
  note: string;
  /** Aggregate counters mirrored for the admin panel (source of truth stays local). */
  testsCompleted: number;
  questionsSolved: number;
  netSum: number;
  /** `${courseId}` -> tests finished, mirrored for cross-device reporting. */
  courseUsage: Record<string, number>;
  /** Marks members that only exist locally because the cloud write was denied. */
  pendingSync?: boolean;
}

export const PLAN_LABEL: Record<VipPlanId, string> = {
  free: 'Ücretsiz',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  lifetime: 'Ömür boyu',
};

export const PLAN_DAYS: Record<Exclude<VipPlanId, 'free'>, number> = {
  monthly: 30,
  yearly: 365,
  lifetime: 0,
};

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  active: 'Aktif',
  pending: 'Onay bekliyor',
  suspended: 'Askıda',
  banned: 'Yasaklı',
};

export const FREE_TESTS_PER_COURSE = 1;

export function emptyMember(id: string): MemberDoc {
  const now = new Date().toISOString();
  return {
    id,
    email: '',
    emailNormalized: '',
    displayName: '',
    password: { verifier: '', salt: '', iterations: 0, algo: 'pbkdf2-sha256' },
    role: 'user',
    status: 'active',
    vip: false,
    vipPlan: 'free',
    vipExpiresAt: '',
    createdAt: now,
    lastLoginAt: now,
    city: '',
    exam: 'KPSS Lisans (GY-GK)',
    note: '',
    testsCompleted: 0,
    questionsSolved: 0,
    netSum: 0,
    courseUsage: {},
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email.trim());
}

export function expiryForPlan(plan: VipPlanId): string {
  if (plan === 'free' || plan === 'lifetime') return '';
  const days = plan === 'monthly' ? PLAN_DAYS.monthly : PLAN_DAYS.yearly;
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function daysLeft(iso: string | undefined | null): number | null {
  if (!iso) return null;
  // `vipExpiresAt` genelde yalnız tarih (YYYY-MM-DD) taşır; tam zaman damgası
  // gelirse de (sunucu/panel yazması) sürenin DOLMUŞ sayılmaması hatasına düşmeyelim.
  const date = String(iso).trim().slice(0, 10);
  const t = new Date(`${date}T23:59:59`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

/** VIP is only real while the plan has not expired and the account is active. */
export function isVipActive(
  member: Pick<MemberDoc, 'vip' | 'vipPlan' | 'vipExpiresAt' | 'status'> | null | undefined
): boolean {
  if (!member || !member.vip) return false;
  if (member.status === 'banned' || member.status === 'suspended') return false;
  // ONAY YOKSA HAK YOK: `pending` üye VIP sayılmaz (eskiden yalnız ban/askı
  // dışlanıyordu, yani onay bekleyen üye deneme VIP'ini kayıt olduğu oturumda
  // kullanabiliyordu — panelde "onay zorunlu" olsa bile).
  if (member.status === 'pending') return false;
  if (member.vipPlan === 'lifetime') return true;
  const left = daysLeft(member.vipExpiresAt);
  if (left === null) return true;
  return left >= 0;
}

/* ------------------------------------------------------------ validation */

export function validateMembership(member: MemberDoc): string | null {
  if (!member.id) return 'Üye kimliği eksik.';
  if (!isValidEmail(member.email)) return 'Geçerli bir e-posta gir.';
  if (!member.displayName.trim()) return 'Ad soyad zorunlu.';
  const left = daysLeft(member.vipExpiresAt);
  if (member.vip && member.vipPlan !== 'lifetime' && member.vipExpiresAt && left !== null && left < 0) {
    return null; // expired VIP is valid data — it just means "free now"
  }
  return null;
}

/* --------------------------------------------------------- quota helpers */

export interface QuotaState {
  enforced: boolean;
  freeTestsPerCourse: number;
  isVip: boolean;
}

/**
 * Tests already finished for one course. A "genel" (karma) result counts towards
 * the course when its topic is known, so karma runs are not a quota loophole.
 */
export function countCourseTests(
  results: Record<string, TestResult>,
  courseId: string,
  topicsOfCourse: TopicMeta[],
  memberId?: string | null
): number {
  // Karma / general exams are counted once, as their own slot, so solving them
  // cannot be used to dodge the per-course limit.
  if (courseId === 'genel') {
    let gen = 0;
    for (const r of Object.values(results)) {
      if (!r || r.courseId !== 'genel') continue;
      if (memberId && r.memberId && r.memberId !== memberId) continue;
      gen++;
    }
    return gen;
  }
  const docIds = new Set(topicsOfCourse.map(t => t.docId));
  let n = 0;
  for (const r of Object.values(results)) {
    if (!r) continue;
    // Legacy entries (no memberId) belong to whoever holds the device profile.
    if (memberId && r.memberId && r.memberId !== memberId) continue;
    if (r.courseId === courseId) n++;
    else if (r.courseId === 'genel' && r.topicDocId && docIds.has(r.topicDocId)) n++;
  }
  return n;
}

export function remainingTests(state: QuotaState, used: number): number {
  if (!state.enforced || state.isVip) return Infinity;
  return Math.max(0, state.freeTestsPerCourse - used);
}

export function canStartTest(state: QuotaState, used: number): boolean {
  return remainingTests(state, used) > 0;
}

/* ------------------------------------------------- Supabase field codecs */

type FbValue = any;

const s = (v: unknown): FbValue => ({ stringValue: v === undefined || v === null ? '' : String(v) });
const n = (v: unknown): FbValue => ({ integerValue: String(Math.round(Number(v) || 0)) });
/** Kural `netSum is number` diyor: ondalık değeri doubleValue olarak taşı (integerValue yuvarlardı). */
const num = (v: unknown): FbValue => {
  const x = Number(v) || 0;
  return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
};
const b = (v: unknown): FbValue => ({ booleanValue: !!v });

/**
 * Kural defteri: çıktı Supabase `public.members` şemasının denetiminden
 * geçer (`lib/memberShape.ts` aynası). `coerceMemberFields` yazmadan hemen önce
 * reddedilecek sapmaları düzelttiği için "kural yazmayı reddetti" sınıfı hatalar
 * oluşmaz; düzeltilemeyeni ise `checkMemberFields` alan adıyla bildirir.
 */
export function memberToFields(m: MemberDoc): Record<string, FbValue> {
  return coerceMemberFields(rawMemberToFields(m), { memberId: m.id, fill: true });
}

function rawMemberToFields(m: MemberDoc): Record<string, FbValue> {
  return {
    id: s(m.id),
    email: s(m.email),
    emailNormalized: s(m.emailNormalized || normalizeEmail(m.email)),
    displayName: s(m.displayName),
    verifier: s(m.password?.verifier),
    salt: s(m.password?.salt),
    iterations: n(m.password?.iterations),
    algo: s(m.password?.algo || 'pbkdf2-sha256'),
    ...(m.authUid ? { authUid: s(m.authUid) } : {}),
    role: s(m.role),
    status: s(m.status),
    vip: b(m.vip),
    vipPlan: s(m.vipPlan),
    vipExpiresAt: s(m.vipExpiresAt),
    createdAt: s(m.createdAt),
    lastLoginAt: s(m.lastLoginAt),
    city: s(m.city),
    exam: s(m.exam),
    note: s(m.note),
    testsCompleted: n(m.testsCompleted),
    questionsSolved: n(m.questionsSolved),
    netSum: num(Math.round((m.netSum || 0) * 10) / 10),
    courseUsage: {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(m.courseUsage || {}).map(([k, v]) => [k, n(v)])
        ),
      },
    },
    schemaVersion: n(1),
  };
}

const readStr = (f: any, k: string, fallback = ''): string =>
  f?.[k]?.stringValue ?? (f?.[k]?.integerValue != null ? String(f[k].integerValue) : fallback);
const readNum = (f: any, k: string, fallback = 0): number => {
  const raw = f?.[k];
  if (!raw) return fallback;
  const v = raw.integerValue ?? raw.doubleValue ?? raw.stringValue;
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
};
const readBool = (f: any, k: string): boolean => {
  const raw = f?.[k];
  if (!raw) return false;
  if (raw.booleanValue !== undefined) return !!raw.booleanValue;
  if (raw.stringValue !== undefined) return raw.stringValue === 'true';
  return false;
};

export function memberFromFields(f: any, id: string): MemberDoc {
  const usageFields = f?.courseUsage?.mapValue?.fields || {};
  const courseUsage: Record<string, number> = {};
  for (const [k, v] of Object.entries<any>(usageFields)) {
    const num = Number(v?.integerValue ?? v?.doubleValue ?? v?.stringValue ?? 0);
    if (Number.isFinite(num)) courseUsage[k] = num;
  }
  const email = readStr(f, 'email');
  return {
    id: readStr(f, 'id', id) || id,
    email,
    emailNormalized: readStr(f, 'emailNormalized', normalizeEmail(email)),
    displayName: readStr(f, 'displayName'),
    password: {
      verifier: readStr(f, 'verifier'),
      salt: readStr(f, 'salt'),
      iterations: readNum(f, 'iterations'),
      algo: readStr(f, 'algo', 'pbkdf2-sha256'),
    },
    ...(readStr(f, 'authUid') ? { authUid: readStr(f, 'authUid') } : {}),
    role: (['user', 'editor', 'admin', 'owner'].includes(readStr(f, 'role'))
      ? readStr(f, 'role')
      : 'user') as MemberRole,
    status: (['active', 'suspended', 'banned', 'pending'].includes(readStr(f, 'status'))
      ? readStr(f, 'status')
      : 'active') as MembershipStatus,
    vip: readBool(f, 'vip'),
    vipPlan: (['free', 'monthly', 'yearly', 'lifetime'].includes(readStr(f, 'vipPlan'))
      ? readStr(f, 'vipPlan')
      : 'free') as VipPlanId,
    vipExpiresAt: readStr(f, 'vipExpiresAt'),
    createdAt: readStr(f, 'createdAt'),
    lastLoginAt: readStr(f, 'lastLoginAt'),
    city: readStr(f, 'city'),
    exam: readStr(f, 'exam'),
    note: readStr(f, 'note'),
    testsCompleted: readNum(f, 'testsCompleted'),
    questionsSolved: readNum(f, 'questionsSolved'),
    netSum: readNum(f, 'netSum'),
    courseUsage,
  };
}
