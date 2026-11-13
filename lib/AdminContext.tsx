import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { CourseId, Question, TopicMeta } from './types';
import {
  AdminActivity,
  AdminRole,
  AdminSettings,
  AdminUser,
  UserStatus,
  VipPlan,
  clearQuestionsOverride,
  clearTipsOverride,
  bumpLocalUsage,
  clearTopicsOverride,
  countOverrides,
  ensureQuestionsOverride,
  ensureTopicsOverride,
  getAdminState,
  getQuestionsOverride,
  getTopicsOverride,
  hydrateAdminState,
  questionKey,
  resetAdminState,
  subscribeAdmin,
  syncMembersIntoAdmin,
  updateAdminSettings,
  updateAdminState,
  writeAdminState,
  writeQuestionsOverride,
  writeTipsOverride,
  writeTopicsOverride,
  ALL_COURSE_IDS,
  type AdminState,
} from './adminStore';
import { fetchTopicQuestions, clearKpssCaches } from './kpssApi';
import { useApp } from './AppContext';

const UNLOCK_TTL_MS = 15 * 60 * 1000;

export type VipGateKey = keyof AdminSettings['vipGates'];
export type FeatureKey = keyof AdminSettings['featureFlags'];

interface AdminContextValue {
  state: AdminState;
  settings: AdminSettings;
  users: AdminUser[];
  activity: AdminActivity[];
  overrides: ReturnType<typeof countOverrides>;

  /* session */
  unlocked: boolean;
  unlock: (pin: string) => boolean;
  lock: () => void;
  pinIsDefault: boolean;

  /* access control derived from the local profile */
  localUser: AdminUser;
  isVip: boolean;
  isVipGated: (gate: VipGateKey) => boolean;
  featureOn: (feature: FeatureKey) => boolean;
  maintenanceActive: boolean;
  announcement: AdminSettings['announcement'];
  examDateOverride: string | null;
  courseOrder: CourseId[];
  hiddenCourses: CourseId[];
  courseTitle: (courseId: CourseId, fallback: string) => string;

  /* topics */
  topicsFor: (courseId: CourseId) => TopicMeta[];
  addTopic: (courseId: CourseId, name: string) => void;
  renameTopic: (courseId: CourseId, docId: string, name: string) => void;
  deleteTopic: (courseId: CourseId, docId: string) => void;
  duplicateTopic: (courseId: CourseId, docId: string) => void;
  sendTopicTo: (courseId: CourseId, docId: string, where: 'top' | 'bottom') => void;
  moveTopic: (courseId: CourseId, index: number, dir: -1 | 1) => void;
  setTopicOrder: (courseId: CourseId, from: number, to: number) => void;
  restoreCourseTopics: (courseId: CourseId) => Promise<void>;

  /* questions */
  loadQuestions: (courseId: CourseId, docId: string) => Promise<Question[]>;
  materializeQuestions: (courseId: CourseId, docId: string) => Promise<Question[]>;
  createQuestion: (courseId: CourseId, docId: string, q: Question) => void;
  /** Tek işlemde birden çok soru: tek yazma + tek etkinlik kaydı (toplu ekleme). */
  createQuestions: (courseId: CourseId, docId: string, list: Question[]) => void;
  updateQuestion: (
    courseId: CourseId,
    docId: string,
    id: string,
    patch: Partial<Question>
  ) => void;
  deleteQuestion: (courseId: CourseId, docId: string, id: string) => void;
  /** Çoklu seçimden silme: N id = TEK yazma + TEK etkinlik kaydı. */
  deleteQuestions: (courseId: CourseId, docId: string, ids: string[]) => void;
  duplicateQuestion: (courseId: CourseId, docId: string, id: string) => void;
  moveQuestion: (courseId: CourseId, docId: string, index: number, dir: -1 | 1) => void;
  shuffleQuestions: (courseId: CourseId, docId: string) => void;
  moveQuestionToTopic: (
    courseId: CourseId,
    fromDocId: string,
    toDocId: string,
    id: string
  ) => Promise<void>;
  restoreTopicQuestions: (courseId: CourseId, docId: string) => Promise<void>;

  /* tips */
  tips: string[];
  addTip: (text: string, index?: number) => void;
  updateTip: (index: number, text: string) => void;
  deleteTip: (index: number) => void;
  moveTip: (index: number, dir: -1 | 1) => void;
  restoreTips: () => Promise<void>;

  /* users */
  upsertUser: (user: AdminUser) => void;
  deleteUser: (id: string) => void;
  patchUser: (id: string, patch: Partial<AdminUser>) => void;
  toggleVip: (id: string) => void;
  grantVip: (id: string, plan: VipPlan, days: number) => void;
  revokeVip: (id: string) => void;
  setUserRole: (id: string, role: AdminRole) => void;
  /** Mirrors the Firestore `memberships` collection into the panel user list. */
  syncCloudMembers: (
    members: {
      id: string;
      email: string;
      displayName: string;
      role: AdminRole;
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
    }[]
  ) => { cloud: number };
  syncCloudMemberPatch: (
    remoteId: string,
    patch: Partial<
      Pick<AdminUser, 'vip' | 'vipPlan' | 'status' | 'note'> & { vipExpiresAt: string | null }
    >
  ) => void;
  dropCloudMember: (remoteId: string) => void;
  /** Mirror a finished test onto the local device profile (panel usage rows). */
  addLocalUsage: (
    courseId: string,
    stats: { total: number; correct: number; wrong: number }
  ) => void;
  setUserStatus: (id: string, status: UserStatus) => void;
  bulkVip: (ids: string[], enable: boolean, plan?: VipPlan, days?: number) => void;

  /* settings, catalog & data */
  patchSettings: (patch: Partial<AdminSettings>) => void;
  setPin: (pin: string) => void;
  setCourseOrder: (order: CourseId[]) => void;
  toggleCourseHidden: (courseId: CourseId) => void;
  renameCourse: (courseId: CourseId, title: string) => void;
  resetAllContent: () => Promise<void>;
  exportJson: () => string;
  importJson: (raw: string) => { ok: boolean; error?: string };
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(subscribeAdmin, getAdminState, getAdminState);
  const { catalog, dailyTips, refreshAllCourses, streak, results, favorites, mistakes } =
    useApp();
  const [unlockedUntil, setUnlockedUntil] = useState<number>(0);

  // Loading the saved overrides bumps the store revision, which makes AppContext
  // re-resolve the catalog and tip list — no cache drop needed.
  useEffect(() => {
    hydrateAdminState();
  }, []);

  const unlocked = unlockedUntil > Date.now();

  useEffect(() => {
    if (!unlocked) return undefined;
    const t = setInterval(() => {
      if (Date.now() > unlockedUntil) setUnlockedUntil(0);
    }, 30_000);
    return () => clearInterval(t);
  }, [unlocked, unlockedUntil]);

  /** Logs one admin action. The kpss read caches keep the raw cloud lists and the
   *  admin overrides shadow them at read time, so they stay valid across edits. */
  const touch = useCallback((activity?: { icon: string; label: string }) => {
    if (activity) {
      updateAdminState(s => s, activity);
    }
  }, []);

  /* ----------------------------------------------------------- session */

  const unlock = useCallback((pin: string) => {
    if (pin.trim() === getAdminState().settings.pin) {
      setUnlockedUntil(Date.now() + UNLOCK_TTL_MS);
      return true;
    }
    return false;
  }, []);

  const lock = useCallback(() => setUnlockedUntil(0), []);

  /* ------------------------------------------------------------ topics */

  const topicsFor = useCallback(
    (courseId: CourseId): TopicMeta[] =>
      getTopicsOverride(courseId) ?? catalog[courseId] ?? [],
    [catalog]
  );

  /** Keeps topic.questionCount in sync with the admin question overrides. */
  const syncCounts = useCallback(
    (courseId: CourseId, docId: string) => {
      const qs = getQuestionsOverride(courseId, docId);
      if (!qs) return;
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      let changed = false;
      const next = topics.map(t => {
        if (t.docId !== docId || t.questionCount === qs.length) return t;
        changed = true;
        return { ...t, questionCount: qs.length };
      });
      if (changed) writeTopicsOverride(courseId, next);
    },
    [topicsFor]
  );

  const addTopic = useCallback(
    (courseId: CourseId, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      const docId = `admin_${Date.now().toString(36)}`;
      writeTopicsOverride(courseId, [
        ...topics,
        { docId, id: docId, name: trimmed, questionCount: 0 },
      ]);
      writeQuestionsOverride(courseId, docId, []);
      touch({ icon: 'add-circle-outline', label: `${courseId}: “${trimmed}” konusu eklendi` });
    },
    [touch, topicsFor]
  );

  const renameTopic = useCallback(
    (courseId: CourseId, docId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId)).map(t =>
        t.docId === docId ? { ...t, name: trimmed } : t
      );
      writeTopicsOverride(courseId, topics);
      touch({ icon: 'create-outline', label: `Konu adı “${trimmed}” olarak güncellendi` });
    },
    [touch, topicsFor]
  );

  const deleteTopic = useCallback(
    (courseId: CourseId, docId: string) => {
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId)).filter(
        t => t.docId !== docId
      );
      writeTopicsOverride(courseId, topics);
      clearQuestionsOverride(courseId, docId);
      touch({ icon: 'trash-outline', label: `${courseId}: bir konu silindi` });
    },
    [touch, topicsFor]
  );

  /** Clones a topic together with its (materialized) question list. */
  const duplicateTopic = useCallback(
    (courseId: CourseId, docId: string) => {
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      const source = topics.find(t => t.docId === docId);
      if (!source) return;
      const newDocId = `admin_${Date.now().toString(36)}`;
      const idx = topics.findIndex(t => t.docId === docId);
      const clone: TopicMeta = {
        ...source,
        docId: newDocId,
        id: newDocId,
        name: `${source.name} (kopya)`,
      };
      const next = [...topics];
      next.splice(idx + 1, 0, clone);
      writeTopicsOverride(courseId, next);
      const questions = getQuestionsOverride(courseId, docId) ?? [];
      writeQuestionsOverride(
        courseId,
        newDocId,
        questions.map((q, i) => ({
          ...q,
          id: `dup_${Date.now().toString(36)}_${i}`,
          topicDocId: newDocId,
          topicName: clone.name,
          options: [...q.options],
        }))
      );
      touch({ icon: 'copy-outline', label: `“${source.name}” kopyalandı` });
    },
    [touch, topicsFor]
  );

  const sendTopicTo = useCallback(
    (courseId: CourseId, docId: string, where: 'top' | 'bottom') => {
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      const idx = topics.findIndex(t => t.docId === docId);
      if (idx < 0) return;
      const next = [...topics];
      const [item] = next.splice(idx, 1);
      if (where === 'top') next.unshift(item);
      else next.push(item);
      writeTopicsOverride(courseId, next);
      touch();
    },
    [touch, topicsFor]
  );

  const setTopicOrder = useCallback(
    (courseId: CourseId, from: number, to: number) => {
      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      if (from < 0 || from >= topics.length) return;
      const target = Math.max(0, Math.min(topics.length - 1, to));
      const next = [...topics];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      writeTopicsOverride(courseId, next);
      touch();
    },
    [touch, topicsFor]
  );

  const moveTopic = useCallback(
    (courseId: CourseId, index: number, dir: -1 | 1) => {
      setTopicOrder(courseId, index, index + dir);
    },
    [setTopicOrder]
  );

  const restoreCourseTopics = useCallback(
    async (courseId: CourseId) => {
      clearTopicsOverride(courseId);
      clearKpssCaches();
      touch({ icon: 'cloud-download-outline', label: `${courseId}: konu listesi buluta sıfırlandı` });
      await refreshAllCourses();
    },
    [refreshAllCourses, touch]
  );

  /* --------------------------------------------------------- questions */

  const loadQuestions = useCallback(
    async (courseId: CourseId, docId: string): Promise<Question[]> => {
      const override = getQuestionsOverride(courseId, docId);
      if (override) return override;
      const meta = topicsFor(courseId).find(t => t.docId === docId);
      return fetchTopicQuestions(courseId, docId, meta?.name);
    },
    [topicsFor]
  );

  const materializeQuestions = useCallback(
    async (courseId: CourseId, docId: string): Promise<Question[]> => {
      const live = await loadQuestions(courseId, docId);
      return ensureQuestionsOverride(courseId, docId, live);
    },
    [loadQuestions]
  );

  /**
   * Mutates the admin question list for a topic. The list must already be
   * materialized (screens do that right after loading) so live content is
   * never accidentally replaced by a partial write.
   */
  const editList = useCallback(
    (
      courseId: CourseId,
      docId: string,
      mutator: (list: Question[]) => Question[],
      activity?: { icon: string; label: string }
    ): void => {
      const current = getQuestionsOverride(courseId, docId);
      if (!current) return;
      writeQuestionsOverride(courseId, docId, mutator(current));
      syncCounts(courseId, docId);
      touch(activity);
    },
    [syncCounts, touch]
  );

  const createQuestion = useCallback(
    (courseId: CourseId, docId: string, q: Question) => {
      editList(courseId, docId, list => [...list, { ...q, courseId, topicDocId: docId }], {
        icon: 'help-outline',
        label: 'Yeni soru eklendi',
      });
    },
    [editList]
  );

  const createQuestions = useCallback(
    (courseId: CourseId, docId: string, list: Question[]) => {
      if (!list.length) return;
      editList(
        courseId,
        docId,
        cur => [...cur, ...list.map(q => ({ ...q, courseId, topicDocId: docId }))],
        {
          icon: 'albums-outline',
          label: `${list.length} soru toplu eklendi`,
        }
      );
    },
    [editList]
  );

  const updateQuestion = useCallback(
    (courseId: CourseId, docId: string, id: string, patch: Partial<Question>) => {
      editList(
        courseId,
        docId,
        list => list.map(q => (String(q.id) === String(id) ? { ...q, ...patch } : q)),
        { icon: 'create-outline', label: 'Soru güncellendi' }
      );
    },
    [editList]
  );

  const deleteQuestion = useCallback(
    (courseId: CourseId, docId: string, id: string) => {
      editList(courseId, docId, list => list.filter(q => String(q.id) !== String(id)), {
        icon: 'trash-outline',
        label: 'Soru silindi',
      });
    },
    [editList]
  );

  const deleteQuestions = useCallback(
    (courseId: CourseId, docId: string, ids: string[]) => {
      const drop = new Set((ids || []).map(String));
      if (!drop.size) return;
      editList(
        courseId,
        docId,
        list => list.filter(q => !drop.has(String(q.id))),
        { icon: 'trash-outline', label: `${drop.size} soru toplu silindi` }
      );
    },
    [editList]
  );

  const duplicateQuestion = useCallback(
    (courseId: CourseId, docId: string, id: string) => {
      editList(
        courseId,
        docId,
        list => {
          const idx = list.findIndex(q => String(q.id) === String(id));
          if (idx < 0) return list;
          const copy: Question = {
            ...list[idx],
            id: `${list[idx].id}_k_${Date.now().toString(36)}`,
            options: [...list[idx].options],
          };
          const next = [...list];
          next.splice(idx + 1, 0, copy);
          return next;
        },
        { icon: 'copy-outline', label: 'Soru kopyalandı' }
      );
    },
    [editList]
  );

  const moveQuestion = useCallback(
    (courseId: CourseId, docId: string, index: number, dir: -1 | 1) => {
      const target = index + dir;
      editList(courseId, docId, list => {
        if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
          return list;
        }
        const next = [...list];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return next;
      });
    },
    [editList]
  );

  const shuffleQuestions = useCallback(
    (courseId: CourseId, docId: string) => {
      editList(courseId, docId, list => [...list].sort(() => Math.random() - 0.5), {
        icon: 'shuffle',
        label: 'Soru sırası karıştırıldı',
      });
    },
    [editList]
  );

  const moveQuestionToTopic = useCallback(
    async (courseId: CourseId, fromDocId: string, toDocId: string, id: string) => {
      if (fromDocId === toDocId) return;
      const source = getQuestionsOverride(courseId, fromDocId);
      if (!source) return;
      const moving = source.find(q => String(q.id) === String(id));
      if (!moving) return;

      const topics = ensureTopicsOverride(courseId, topicsFor(courseId));
      const targetName = topics.find(t => t.docId === toDocId)?.name;
      const targetList = getQuestionsOverride(courseId, toDocId) ?? (await loadQuestions(courseId, toDocId));

      writeQuestionsOverride(courseId, fromDocId, source.filter(q => String(q.id) !== String(id)));
      writeQuestionsOverride(courseId, toDocId, [
        ...targetList,
        { ...moving, topicDocId: toDocId, topicName: targetName },
      ]);
      syncCounts(courseId, fromDocId);
      syncCounts(courseId, toDocId);
      touch({ icon: 'arrow-forward-outline', label: 'Soru başka konuya taşındı' });
    },
    [loadQuestions, syncCounts, touch, topicsFor]
  );

  const restoreTopicQuestions = useCallback(
    async (courseId: CourseId, docId: string) => {
      clearQuestionsOverride(courseId, docId);
      clearKpssCaches();
      touch({ icon: 'cloud-download-outline', label: 'Soru listesi buluttan geri yüklendi' });
      await refreshAllCourses();
    },
    [refreshAllCourses, touch]
  );

  /* -------------------------------------------------------------- tips */

  const tips = state.content.tips ?? dailyTips;

  const mutateTips = useCallback(
    (mutator: (list: string[]) => string[], activity?: { icon: string; label: string }) => {
      const base = getAdminState().content.tips ?? dailyTips;
      writeTipsOverride(mutator(base));
      touch(activity);
    },
    [dailyTips, touch]
  );

  const addTip = useCallback(
    (text: string, index?: number) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      mutateTips(list => {
        const next = [...list];
        next.splice(index === undefined ? next.length : index, 0, trimmed);
        return next;
      }, { icon: 'bulb-outline', label: 'Hap bilgi eklendi' });
    },
    [mutateTips]
  );

  const updateTip = useCallback(
    (index: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      mutateTips(list => list.map((t, i) => (i === index ? trimmed : t)), {
        icon: 'create-outline',
        label: 'Hap bilgi güncellendi',
      });
    },
    [mutateTips]
  );

  const deleteTip = useCallback(
    (index: number) => {
      mutateTips(list => list.filter((_, i) => i !== index), {
        icon: 'trash-outline',
        label: 'Hap bilgi silindi',
      });
    },
    [mutateTips]
  );

  const moveTip = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir;
      mutateTips(list => {
        if (target < 0 || target >= list.length) return list;
        const next = [...list];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return next;
      });
    },
    [mutateTips]
  );

  const restoreTips = useCallback(async () => {
    clearTipsOverride();
    touch({ icon: 'cloud-download-outline', label: 'Hap bilgiler buluttan geri yüklendi' });
    await refreshAllCourses();
  }, [refreshAllCourses, touch]);

  /* ------------------------------------------------------------- users */

  const mutateUsers = useCallback(
    (
      mutator: (users: AdminUser[]) => AdminUser[],
      activity?: { icon: string; label: string }
    ) => {
      updateAdminState(s => ({ ...s, users: mutator(s.users) }), activity);
    },
    []
  );

  const upsertUser = useCallback(
    (user: AdminUser) => {
      mutateUsers(list => {
        const idx = list.findIndex(u => u.id === user.id);
        if (idx < 0) return [user, ...list];
        const next = [...list];
        next[idx] = { ...next[idx], ...user };
        return next;
      }, { icon: 'person-outline', label: `Kullanıcı kaydı: ${user.name}` });
    },
    [mutateUsers]
  );

  const deleteUser = useCallback(
    (id: string) => {
      mutateUsers(list => list.filter(u => u.id !== id), {
        icon: 'person-remove-outline',
        label: 'Kullanıcı silindi',
      });
    },
    [mutateUsers]
  );

  const patchUser = useCallback(
    (id: string, patch: Partial<AdminUser>) => {
      mutateUsers(list => list.map(u => (u.id === id ? { ...u, ...patch } : u)));
    },
    [mutateUsers]
  );

  const expiryFor = (plan: VipPlan, days: number): string | null => {
    if (plan === 'lifetime' || plan === 'free') return null;
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  };

  const grantVip = useCallback(
    (id: string, plan: VipPlan, days: number) => {
      mutateUsers(
        list =>
          list.map(u =>
            u.id === id
              ? { ...u, vip: plan !== 'free', vipPlan: plan, vipExpiresAt: expiryFor(plan, days) }
              : u
          ),
        { icon: 'diamond-outline', label: 'VIP verildi' }
      );
    },
    [mutateUsers]
  );

  const revokeVip = useCallback(
    (id: string) => {
      mutateUsers(
        list =>
          list.map(u =>
            u.id === id ? { ...u, vip: false, vipPlan: 'free', vipExpiresAt: null } : u
          ),
        { icon: 'diamond-outline', label: 'VIP kaldırıldı' }
      );
    },
    [mutateUsers]
  );

  const toggleVip = useCallback(
    (id: string) => {
      const user = getAdminState().users.find(u => u.id === id);
      if (!user) return;
      if (user.vip) revokeVip(id);
      else grantVip(id, 'monthly', 30);
    },
    [grantVip, revokeVip]
  );

  const setUserRole = useCallback(
    (id: string, role: AdminRole) => {
      mutateUsers(list => list.map(u => (u.id === id ? { ...u, role } : u)), {
        icon: 'shield-checkmark-outline',
        label: `Rol güncellendi: ${role}`,
      });
    },
    [mutateUsers]
  );

  const setUserStatus = useCallback(
    (id: string, status: UserStatus) => {
      mutateUsers(list => list.map(u => (u.id === id ? { ...u, status } : u)), {
        icon: status === 'active' ? 'checkmark-circle-outline' : 'ban-outline',
        label: `Hesap durumu: ${status}`,
      });
    },
    [mutateUsers]
  );

  const bulkVip = useCallback(
    (ids: string[], enable: boolean, plan: VipPlan = 'monthly', days = 30) => {
      const idSet = new Set(ids);
      mutateUsers(
        list =>
          list.map(u =>
            idSet.has(u.id)
              ? enable
                ? { ...u, vip: true, vipPlan: plan, vipExpiresAt: expiryFor(plan, days) }
                : { ...u, vip: false, vipPlan: 'free' as VipPlan, vipExpiresAt: null }
              : u
          ),
        { icon: 'people-outline', label: `${ids.length} kullanıcıda VIP ${enable ? 'açıldı' : 'kapatıldı'}` }
      );
    },
    [mutateUsers]
  );

  /** Mirrors the Firestore memberships collection into the panel user list. */
  const syncCloudMembers = useCallback<AdminContextValue['syncCloudMembers']>(
    members => {
      const res = syncMembersIntoAdmin(members as any);
      return { cloud: res.cloud };
    },
    []
  );

  const syncCloudMemberPatch = useCallback<AdminContextValue['syncCloudMemberPatch']>(
    (remoteId, patch) => {
      mutateUsers(list =>
        list.map(u => (u.remoteId === remoteId ? { ...u, ...(patch as Partial<AdminUser>) } : u))
      );
    },
    [mutateUsers]
  );

  const addLocalUsage = useCallback<AdminContextValue['addLocalUsage']>(
    (courseId, questionCount) => {
      mutateUsers(list => bumpLocalUsage(list, courseId, questionCount));
    },
    [mutateUsers]
  );

  const dropCloudMember = useCallback<AdminContextValue['dropCloudMember']>(
    remoteId => {
      mutateUsers(list => list.filter(u => u.remoteId !== remoteId));
    },
    [mutateUsers]
  );

  /* ------------------------------------------------------ settings etc */

  const patchSettings = useCallback((patch: Partial<AdminSettings>) => {
    updateAdminSettings(patch);
  }, []);

  const setPin = useCallback((pin: string) => {
    const clean = pin.replace(/\D/g, '').slice(0, 8);
    if (clean.length < 4) return;
    updateAdminSettings({ pin: clean });
    updateAdminState(s => s, {
      icon: 'lock-closed-outline',
      label: 'Yönetici PIN’i değiştirildi',
    });
  }, []);

  const setCourseOrder = useCallback(
    (order: CourseId[]) => {
      const normalized = [...order.filter(id => ALL_COURSE_IDS.includes(id))];
      for (const id of ALL_COURSE_IDS) {
        if (!normalized.includes(id)) normalized.push(id);
      }
      updateAdminState(s => ({ ...s, content: { ...s.content, courseOrder: normalized } }));
      touch({ icon: 'swap-vertical-outline', label: 'Ders sırası güncellendi' });
    },
    [touch]
  );

  const toggleCourseHidden = useCallback(
    (courseId: CourseId) => {
      updateAdminState(s => {
        const hidden = s.content.hiddenCourses.includes(courseId)
          ? s.content.hiddenCourses.filter(c => c !== courseId)
          : [...s.content.hiddenCourses, courseId];
        return { ...s, content: { ...s.content, hiddenCourses: hidden } };
      });
      touch({ icon: 'eye-outline', label: 'Ders görünürlüğü güncellendi' });
    },
    [touch]
  );

  const renameCourse = useCallback(
    (courseId: CourseId, title: string) => {
      const trimmed = title.trim();
      updateAdminState(s => {
        const titles = { ...s.content.courseTitles };
        if (!trimmed) delete titles[courseId];
        else titles[courseId] = trimmed;
        return { ...s, content: { ...s.content, courseTitles: titles } };
      });
      touch({ icon: 'create-outline', label: 'Ders başlığı güncellendi' });
    },
    [touch]
  );

  const resetAllContent = useCallback(async () => {
    await resetAdminState();
    clearKpssCaches();
    await refreshAllCourses();
  }, [refreshAllCourses]);

  const exportJson = useCallback(() => JSON.stringify(getAdminState(), null, 2), []);

  const importJson = useCallback((raw: string) => {
    try {
      const parsed = JSON.parse(raw) as AdminState;
      if (!parsed || typeof parsed !== 'object' || !parsed.content) {
        return { ok: false, error: 'Geçersiz yönetim verisi.' };
      }
      writeAdminState({
        ...parsed,
        settings: { ...getAdminState().settings, ...(parsed.settings || {}) },
        users: Array.isArray(parsed.users) ? parsed.users : getAdminState().users,
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      });
      clearKpssCaches();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }, []);

  /* ---------------------------------------------------------- derived */

  const localUser = useMemo(() => {
    const base = state.users.find(u => u.isLocal) || state.users[0];
    const solved = Object.values(results).reduce((sum, r) => sum + (r.total || 0), 0);
    const net = Object.values(results).reduce((sum, r) => sum + (r.net || 0), 0);
    const favoriteCount = favorites.length;
    return {
      ...base,
      solved: solved || base.solved,
      net: Math.round(net * 10) / 10 || base.net,
      streak: streak.current || base.streak,
      note:
        base.note ||
        `${favoriteCount} favori • ${mistakes.length} hata defteri kaydı`,
    };
  }, [favorites.length, mistakes.length, results, state.users, streak.current]);

  const isVip = localUser.vip && localUser.status === 'active';

  const isVipGated = useCallback(
    (gate: VipGateKey) => !!state.settings.vipGates[gate] && !isVip,
    [isVip, state.settings.vipGates]
  );

  const featureOn = useCallback(
    (feature: FeatureKey) => state.settings.featureFlags[feature] !== false,
    [state.settings.featureFlags]
  );

  const courseTitle = useCallback(
    (courseId: CourseId, fallback: string) =>
      state.content.courseTitles[courseId] || fallback,
    [state.content.courseTitles]
  );

  const overrides = useMemo(() => countOverrides(state), [state]);

  const value = useMemo<AdminContextValue>(
    () => ({
      state,
      settings: state.settings,
      users: state.users,
      activity: state.activity,
      overrides,
      unlocked,
      unlock,
      lock,
      pinIsDefault: state.settings.pin === '2468',
      localUser,
      isVip,
      isVipGated,
      featureOn,
      maintenanceActive: state.settings.maintenance.enabled,
      announcement: state.settings.announcement,
      examDateOverride: state.settings.examDateOverride,
      courseOrder: state.content.courseOrder,
      hiddenCourses: state.content.hiddenCourses,
      courseTitle,
      topicsFor,
      addTopic,
      renameTopic,
      deleteTopic,
      moveTopic,
      setTopicOrder,
      duplicateTopic,
      sendTopicTo,
      restoreCourseTopics,
      loadQuestions,
      materializeQuestions,
      createQuestion,
      createQuestions,
      updateQuestion,
      deleteQuestion,
      deleteQuestions,
      duplicateQuestion,
      moveQuestion,
      shuffleQuestions,
      moveQuestionToTopic,
      restoreTopicQuestions,
      tips,
      addTip,
      updateTip,
      deleteTip,
      moveTip,
      restoreTips,
      upsertUser,
      deleteUser,
      patchUser,
      toggleVip,
      grantVip,
      revokeVip,
      setUserRole,
      setUserStatus,
      bulkVip,
      syncCloudMembers,
      syncCloudMemberPatch,
      addLocalUsage,
      dropCloudMember,
      patchSettings,
      setPin,
      setCourseOrder,
      toggleCourseHidden,
      renameCourse,
      resetAllContent,
      exportJson,
      importJson,
    }),
    [
      state,
      overrides,
      unlocked,
      unlock,
      lock,
      localUser,
      isVip,
      isVipGated,
      featureOn,
      courseTitle,
      topicsFor,
      addTopic,
      renameTopic,
      deleteTopic,
      moveTopic,
      setTopicOrder,
      duplicateTopic,
      sendTopicTo,
      restoreCourseTopics,
      loadQuestions,
      materializeQuestions,
      createQuestion,
      createQuestions,
      updateQuestion,
      deleteQuestion,
      deleteQuestions,
      duplicateQuestion,
      moveQuestion,
      shuffleQuestions,
      moveQuestionToTopic,
      restoreTopicQuestions,
      tips,
      addTip,
      updateTip,
      deleteTip,
      moveTip,
      restoreTips,
      upsertUser,
      deleteUser,
      patchUser,
      toggleVip,
      grantVip,
      revokeVip,
      setUserRole,
      setUserStatus,
      bulkVip,
      syncCloudMembers,
      syncCloudMemberPatch,
      addLocalUsage,
      dropCloudMember,
      patchSettings,
      setPin,
      setCourseOrder,
      toggleCourseHidden,
      renameCourse,
      resetAllContent,
      exportJson,
      importJson,
    ]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdmin = (): AdminContextValue => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used inside AdminProvider');
  }
  return ctx;
};

export { questionKey };
