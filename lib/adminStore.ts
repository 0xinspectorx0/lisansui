/**
 * Admin store — device-local management layer for all app content.
 *
 * Model: "materialize on first write".
 *  - By default the app shows live Supabase / bundled seed content (no override).
 *  - The first time an admin touches a course's topic list, a topic's question
 *    list, or the daily tips list, the currently effective list is copied into
 *    `state.content` and becomes the authoritative source for that scope.
 *  - Clearing an override returns that scope to the live cloud content.
 *
 * The store is framework-free (no React) so `lib/kpssApi.ts` can read it while
 * resolving content, and `useSyncExternalStore` in AdminContext can subscribe.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CourseId, Question, TopicMeta } from './types';

export const ADMIN_STORAGE_KEY = '@kpss_admin_v1';
export const DEFAULT_ADMIN_PIN = '2468';

export const ALL_COURSE_IDS: CourseId[] = [
  'tarih',
  'cografya',
  'turkce',
  'vatandaslik',
  'guncel',
];

/* ------------------------------------------------------------------ types */

export type VipPlan = 'free' | 'monthly' | 'yearly' | 'lifetime';
export type AdminRole = 'owner' | 'admin' | 'editor' | 'user';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'banned';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: UserStatus;
  vip: boolean;
  vipPlan: VipPlan;
  /** ISO date (yyyy-mm-dd) or null when the plan has no end (lifetime/free). */
  vipExpiresAt: string | null;
  joinedAt: string;
  lastActiveAt: string;
  solved: number;
  net: number;
  streak: number;
  exam: string;
  city: string;
  note: string;
  /** Marks the profile that belongs to this device (drives VIP gating in-app). */
  isLocal?: boolean;
  /**
   * Supabase document id when this row mirrors a real cloud member
   * (`memberships/{remoteId}`). Undefined = local-only fixture row.
   */
  remoteId?: string;
  /** Row mirrors a cloud member but the last write was rejected by rules. */
  pendingSync?: boolean;
  testsCompleted?: number;
  questionsSolved?: number;
}

export interface MembershipConfig {
  /** Master switch: enforce "free members solve N tests per course". */
  enforce: boolean;
  freeTestsPerCourse: number;
  /**
   * Read the VIP flag from the signed-in member's Supabase document instead of
   * the local device profile. Turn off to test gates on a device without an account.
   */
  cloudVip: boolean;
  /** Sync the admin panel's user list against the `memberships` collection. */
  cloudMembers: boolean;
  /** Days granted when a new sign-up is created (0 = none). */
  defaultTrialDays: number;
  /**
   * When true a sign-up also has to be approved (status = pending) by an admin.
   * Cihazda değil, Supabase'da durur (`meta/membership_policy`): panelde
   * değiştirildiği anda yazılır, her cihaz oradan okur.
   */
  requireApproval: boolean;
}

export interface AdminSettings {
  pin: string;
  maintenance: { enabled: boolean; title: string; message: string };
  announcement: {
    enabled: boolean;
    text: string;
    tone: 'info' | 'warning' | 'success';
  };
  defaultTheme: 'system' | 'light' | 'dark';
  dailyGoalDefault: number;
  /** Overrides the exam countdown date for every user (yyyy-mm-dd) or null. */
  examDateOverride: string | null;
  registrationOpen: boolean;
  vipTrialDays: number;
  /** Features that require VIP when the matching gate is switched on. */
  vipGates: {
    karmaExam: boolean;
    tips: boolean;
    review: boolean;
    focus: boolean;
  };
  featureFlags: {
    streak: boolean;
    favorites: boolean;
    mistakes: boolean;
    topicProgress: boolean;
  };
  quizDefaults: {
    questionCount: number;
    timedMinutes: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  };
  /** Membership + quota policy; the member records themselves live in Supabase. */
  membership: MembershipConfig;
}

export const DEFAULT_MEMBERSHIP: MembershipConfig = {
  enforce: true,
  freeTestsPerCourse: 1,
  cloudVip: true,
  cloudMembers: true,
  defaultTrialDays: 0,
  // Onay varsayılan olarak ZORUNLU: yönetici onaylamadan üyelik `pending` doğar
  // (VIP/kota hakkı onaydan sonra açılır). Kapatmak panelin tek dokunuşu.
  requireApproval: true,
};

export interface AdminActivity {
  id: string;
  at: string;
  icon: string;
  label: string;
}

export interface AdminContent {
  /** course -> full authoritative topic list (when admin has edited it) */
  topics: Partial<Record<CourseId, TopicMeta[]>>;
  /** `${courseId}:${topicDocId}` -> full authoritative question list */
  questions: Record<string, Question[]>;
  /** authoritative daily tips list (string[] in app order) */
  tips: string[] | null;
  courseOrder: CourseId[];
  hiddenCourses: CourseId[];
  courseTitles: Partial<Record<CourseId, string>>;
}

export interface AdminState {
  /** bumped on every mutation — lets other providers re-derive content */
  revision: number;
  content: AdminContent;
  users: AdminUser[];
  settings: AdminSettings;
  activity: AdminActivity[];
  savedAt: string | null;
}

/* ---------------------------------------------------------------- defaults */

export const DEFAULT_SETTINGS: AdminSettings = {
  pin: DEFAULT_ADMIN_PIN,
  maintenance: {
    enabled: false,
    title: 'Bakım modu açık',
    message:
      'KPSS Asistanı şu anda bakımda. Soru havuzunu güncelliyoruz, kısa süre içinde yeniden yayındayız.',
  },
  announcement: {
    enabled: false,
    text: 'Güncel Bilgiler konusu 2026 gündemiyle yenilendi.',
    tone: 'info',
  },
  defaultTheme: 'system',
  dailyGoalDefault: 60,
  examDateOverride: null,
  registrationOpen: true,
  vipTrialDays: 7,
  vipGates: { karmaExam: false, tips: false, review: false, focus: false },
  featureFlags: {
    streak: true,
    favorites: true,
    mistakes: true,
    topicProgress: true,
  },
  quizDefaults: {
    questionCount: 20,
    timedMinutes: 25,
    shuffleQuestions: true,
    shuffleOptions: false,
  },
  membership: { ...DEFAULT_MEMBERSHIP },
};

const LEGACY_DEMO_USER_IDS = new Set([
  'u_elif',
  'u_murat',
  'u_zeynep',
  'u_ahmet',
  'u_selin',
  'u_can',
  'u_hatice',
  'u_burak',
  'u_derya',
]);

const SEED_USERS: AdminUser[] = [
  {
    id: 'u_local',
    name: 'Bu cihaz (yerel profil)',
    email: 'local@kpssasistani.com',
    role: 'user',
    status: 'active',
    vip: false,
    vipPlan: 'free',
    vipExpiresAt: null,
    joinedAt: '2026-09-02',
    lastActiveAt: new Date().toISOString().slice(0, 10),
    solved: 0,
    net: 0,
    streak: 0,
    exam: 'KPSS Lisans (GY-GK)',
    city: 'Elazığ',
    note: 'Cihazdaki ilerleme gerçek verilerden beslenir.',
    isLocal: true,
  },
];

function createDefaultState(): AdminState {
  return {
    revision: 0,
    content: {
      topics: {},
      questions: {},
      tips: null,
      courseOrder: [...ALL_COURSE_IDS],
      hiddenCourses: [],
      courseTitles: {},
    },
    users: SEED_USERS.map(u => ({ ...u })),
    settings: {
      ...DEFAULT_SETTINGS,
      maintenance: { ...DEFAULT_SETTINGS.maintenance },
      announcement: { ...DEFAULT_SETTINGS.announcement },
      vipGates: { ...DEFAULT_SETTINGS.vipGates },
      featureFlags: { ...DEFAULT_SETTINGS.featureFlags },
      quizDefaults: { ...DEFAULT_SETTINGS.quizDefaults },
      membership: { ...DEFAULT_MEMBERSHIP },
    },
    activity: [],
    savedAt: null,
  };
}

/* ------------------------------------------------------------- store core */

let state: AdminState = createDefaultState();
let hydrated = false;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  listeners.forEach(l => l());
}

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, 120);
}

export function getAdminState(): AdminState {
  return state;
}

export function subscribeAdmin(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isAdminHydrated(): boolean {
  return hydrated;
}

export function updateAdminState(
  mutator: (draft: AdminState) => AdminState,
  activity?: { icon: string; label: string }
): void {
  const next = mutator(state);
  const withLog = activity
    ? {
        ...next,
        activity: [
          {
            id: `a_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
            at: new Date().toISOString(),
            icon: activity.icon,
            label: activity.label,
          },
          ...next.activity,
        ].slice(0, 60),
      }
    : next;

  state = { ...withLog, revision: state.revision + 1, savedAt: new Date().toISOString() };
  persist();
  emit();
}

export async function hydrateAdminState(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AdminState>;
      const def = createDefaultState();
      state = {
        ...def,
        ...parsed,
        revision: 0,
        content: {
          ...def.content,
          ...(parsed.content || {}),
          topics: parsed.content?.topics || {},
          questions: parsed.content?.questions || {},
          courseTitles: parsed.content?.courseTitles || {},
          hiddenCourses: Array.isArray(parsed.content?.hiddenCourses)
            ? parsed.content!.hiddenCourses
            : [],
          courseOrder:
            Array.isArray(parsed.content?.courseOrder) && parsed.content!.courseOrder.length
              ? normalizeCourseOrder(parsed.content!.courseOrder)
              : def.content.courseOrder,
        },
        users:
          Array.isArray(parsed.users) && parsed.users.length > 0
            ? parsed.users.filter(u => !LEGACY_DEMO_USER_IDS.has(u.id))
            : def.users,
        settings: {
          ...def.settings,
          ...(parsed.settings || {}),
          maintenance: { ...def.settings.maintenance, ...(parsed.settings?.maintenance || {}) },
          announcement: {
            ...def.settings.announcement,
            ...(parsed.settings?.announcement || {}),
          },
          vipGates: { ...def.settings.vipGates, ...(parsed.settings?.vipGates || {}) },
          featureFlags: {
            ...def.settings.featureFlags,
            ...(parsed.settings?.featureFlags || {}),
          },
          quizDefaults: {
            ...def.settings.quizDefaults,
            ...(parsed.settings?.quizDefaults || {}),
          },
          membership: {
            ...def.settings.membership,
            ...(parsed.settings?.membership || {}),
          },
        },
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      };
      // The local profile must always exist.
      if (!state.users.some(u => u.isLocal)) {
        state = { ...state, users: [def.users[0], ...state.users] };
      }
      // Bump the revision so content that was already derived from the seed
      // data (catalog, tips) is re-resolved through the loaded overrides.
      if (raw) {
        state = { ...state, revision: state.revision + 1 };
      }
    }
  } catch {
    // Keep defaults if storage is unreadable
  } finally {
    hydrated = true;
    emit();
  }
}

function normalizeCourseOrder(order: CourseId[]): CourseId[] {
  const seen = new Set<CourseId>();
  const out: CourseId[] = [];
  for (const id of order) {
    if (ALL_COURSE_IDS.includes(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of ALL_COURSE_IDS) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/** Wipes every admin override + settings change (dev helper). */
export async function resetAdminState(): Promise<void> {
  state = createDefaultState();
  hydrated = true;
  try {
    await AsyncStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

/* --------------------------------------------------------------- helpers */

export function questionKey(courseId: CourseId, topicDocId: string): string {
  return `${courseId}:${topicDocId}`;
}

/** Topic list override for a course, or null when the admin has not touched it. */
export function getTopicsOverride(courseId: CourseId): TopicMeta[] | null {
  return state.content.topics[courseId] ?? null;
}

export function getQuestionsOverride(
  courseId: CourseId,
  topicDocId: string
): Question[] | null {
  return state.content.questions[questionKey(courseId, topicDocId)] ?? null;
}

export function getTipsOverride(): string[] | null {
  return state.content.tips;
}

/** Applies the admin topic list on top of live/seed content (identity when untouched). */
export function applyAdminTopics(courseId: CourseId, base: TopicMeta[]): TopicMeta[] {
  return getTopicsOverride(courseId) ?? base;
}

/** Applies the admin question list on top of live/seed content. */
export function applyAdminQuestions(
  courseId: CourseId,
  topicDocId: string,
  base: Question[]
): Question[] {
  return getQuestionsOverride(courseId, topicDocId) ?? base;
}

export function applyAdminTips(base: string[]): string[] {
  return getTipsOverride() ?? base;
}

/**
 * Ensures a course's topic list exists as an editable override, seeded from the
 * currently effective content (live or seed).
 */
export function ensureTopicsOverride(
  courseId: CourseId,
  current: TopicMeta[]
): TopicMeta[] {
  const existing = getTopicsOverride(courseId);
  if (existing) return existing.map(t => ({ ...t }));
  const base = current.map(t => ({ ...t }));
  updateAdminState(s => ({
    ...s,
    content: { ...s.content, topics: { ...s.content.topics, [courseId]: base } },
  }));
  return base;
}

export function writeTopicsOverride(courseId: CourseId, topics: TopicMeta[]): void {
  updateAdminState(s => ({
    ...s,
    content: { ...s.content, topics: { ...s.content.topics, [courseId]: topics } },
  }));
}

export function clearTopicsOverride(courseId: CourseId): void {
  updateAdminState(s => {
    const topics = { ...s.content.topics };
    delete topics[courseId];
    const questions = { ...s.content.questions };
    Object.keys(questions).forEach(k => {
      if (k.startsWith(`${courseId}:`)) delete questions[k];
    });
    return { ...s, content: { ...s.content, topics, questions } };
  });
}

export function ensureQuestionsOverride(
  courseId: CourseId,
  topicDocId: string,
  current: Question[]
): Question[] {
  const existing = getQuestionsOverride(courseId, topicDocId);
  if (existing) return existing.map(q => ({ ...q, options: [...q.options] }));
  const base = current.map(q => ({ ...q, options: [...q.options] }));
  writeQuestionsOverride(courseId, topicDocId, base);
  return base;
}

export function writeQuestionsOverride(
  courseId: CourseId,
  topicDocId: string,
  questions: Question[]
): void {
  updateAdminState(s => ({
    ...s,
    content: {
      ...s.content,
      questions: { ...s.content.questions, [questionKey(courseId, topicDocId)]: questions },
    },
  }));
}

export function clearQuestionsOverride(courseId: CourseId, topicDocId: string): void {
  updateAdminState(s => {
    const questions = { ...s.content.questions };
    delete questions[questionKey(courseId, topicDocId)];
    return { ...s, content: { ...s.content, questions } };
  });
}

export function writeTipsOverride(tips: string[]): void {
  updateAdminState(s => ({ ...s, content: { ...s.content, tips } }));
}

export function clearTipsOverride(): void {
  updateAdminState(s => ({ ...s, content: { ...s.content, tips: null } }));
}

export function updateAdminSettings(patch: Partial<AdminSettings>): void {
  updateAdminState(s => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function updateAdminUsers(users: AdminUser[]): void {
  updateAdminState(s => ({ ...s, users }));
}

export function writeAdminState(next: AdminState): void {
  state = { ...next, revision: state.revision + 1, savedAt: new Date().toISOString() };
  persist();
  emit();
}

/** How many scopes are currently overridden — used by the dashboard. */
/**
 * Mirror a finished test onto the local device profile so the admin panel's
 * own row shows real usage (cloud members get their numbers from Supabase).
 */
export function bumpLocalUsage(
  users: AdminUser[],
  _courseId: string,
  stats: { total: number; correct: number; wrong: number }
): AdminUser[] {
  return users.map(u => {
    if (!u.isLocal) return u;
    return {
      ...u,
      solved: u.solved + stats.total,
      net: u.net + stats.correct - stats.total * 0.25,
      streak: Math.max(1, u.streak),
      lastActiveAt: new Date().toISOString().slice(0, 10),
      testsCompleted: (u.testsCompleted ?? 0) + 1,
      questionsSolved: (u.questionsSolved ?? 0) + stats.total,
    };
  });
}

export function countOverrides(s: AdminState = state): {
  courses: number;
  topics: number;
  questions: number;
  tips: boolean;
} {
  return {
    courses:
      s.content.hiddenCourses.length > 0 ||
      s.content.courseOrder.join() !== ALL_COURSE_IDS.join() ||
      Object.keys(s.content.courseTitles).length > 0
        ? 1
        : 0,
    topics: Object.keys(s.content.topics).length,
    questions: Object.keys(s.content.questions).length,
    tips: s.content.tips !== null,
  };
}

/**
 * Mirrors the Supabase `memberships` collection into the admin user list so the
 * panel edits/creates real cloud records (id stays addressable via `remoteId`).
 * Local demo rows that do not exist in the cloud are dropped.
 */
export function syncMembersIntoAdmin(
  members: {
    id: string;
    email: string;
    displayName: string;
    role: AdminRole;
    /** MembershipStatus from lib/membership — kept as string to avoid a store->domain import cycle. */
    status: string;
    vip: boolean;
    vipPlan: VipPlan;
    vipExpiresAt: string;
    createdAt: string;
    lastLoginAt: string;
    city: string;
    exam: string;
    note: string;
    testsCompleted: number;
    questionsSolved: number;
    netSum: number;
    pendingSync?: boolean;
  }[]
): { keptLocal: number; cloud: number } {
  const local = state.users.find(u => u.isLocal);
  const mapped: AdminUser[] = members.map(m => ({
    id: `cloud_${m.id}`,
    remoteId: m.id,
    name: m.displayName || m.email,
    email: m.email,
    role: m.role,
    status: (m.status === 'pending' || m.status === 'active' || m.status === 'banned'
      ? m.status
      : 'suspended') as UserStatus,
    vip: m.vip,
    vipPlan: m.vipPlan,
    vipExpiresAt: m.vipExpiresAt || null,
    joinedAt: (m.createdAt || '').slice(0, 10) || '—',
    lastActiveAt: (m.lastLoginAt || '').slice(0, 10) || '—',
    solved: m.questionsSolved,
    net: Math.round(m.netSum * 10) / 10,
    streak: 0,
    exam: m.exam,
    city: m.city,
    note: m.note,
    pendingSync: m.pendingSync,
    testsCompleted: m.testsCompleted,
  }));
  const next = local ? [local, ...mapped] : mapped;
  updateAdminState(s => ({ ...s, users: next }), {
    icon: 'cloud-upload-outline',
    label: `Üyelikler Supabase’dan senkronize edildi (${mapped.length} kayıt)`,
  });
  return { keptLocal: local ? 1 : 0, cloud: mapped.length };
}
