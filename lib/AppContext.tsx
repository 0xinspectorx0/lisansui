import { watchContentUpdates } from './contentUpdates';
import { watchUserData } from './watchUserData';
import { finishPersonalLoad, subscribePersonalReload } from './personalLoadBarrier';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CourseId,
  DailyStats,
  Question,
  QuizResultPayload,
  QuizSessionPayload,
  SavedQuestion,
  StreakData,
  TestResult,
  TopicMeta,
} from './types';
import {
  fetchCloudDailyTips,
  invalidateLiveContent,
  getInitialCatalog,
  refreshCourseTopics,
} from './kpssApi';
import { applyAdminTips, ALL_COURSE_IDS, getAdminState, subscribeAdmin } from './adminStore';
import { INITIAL_DAILY_TIPS } from './seedData';
import {
  STORAGE_KIND,
  currentBinding,
  pullUserData,
  pushUserData,
  syncUserTestChanges,
  subscribeBinding,
  type MemberBinding,
  type UserDataKind,
} from './userDataSync';
import { calcKpssNet } from './textUtils';

const STORAGE_KEYS = {
  RESULTS: '@kpss_results_v2',
  MISTAKES: '@kpss_mistakes_v2',
  FAVORITES: '@kpss_favorites_v2',
  STUDIED_TOPICS: '@kpss_studied_topics_v2',
  LEARNED_TIPS: '@kpss_learned_tips_v2',
  SAVED_TIPS: '@kpss_saved_tips_v2',
  STREAK: '@kpss_streak_v2',
  DAILY_STATS: '@kpss_daily_stats_v2',
  FOCUS_TOTAL: '@kpss_focus_total_v2',
  SETTINGS: '@kpss_settings_v2',
};

/** Guest data and each account have separate on-device caches. */
export function personalCacheKey(key: string, binding: MemberBinding | null): string {
  if (!binding) return key;
  return `@kpss_user:${encodeURIComponent(binding.userId || binding.email.toLowerCase())}:${key}`;
}

export interface ExamPreset {
  id: string;
  label: string;
  dateIso: string;
}

export const EXAM_PRESETS: ExamPreset[] = [
  { id: 'lisans_2027', label: 'KPSS Lisans (GY-GK)', dateIso: '2027-07-18' },
  { id: 'ags_2027', label: 'MEB-AGS / ÖABT', dateIso: '2027-07-25' },
  { id: 'onlisans_2028', label: 'KPSS Ön Lisans', dateIso: '2028-09-03' },
  { id: 'ortaogretim_2028', label: 'KPSS Ortaöğretim', dateIso: '2028-09-17' },
];

interface UserSettings {
  dailyGoal: number;
  examPresetId: string;
  autoClearMistakes: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  dailyGoal: 60,
  examPresetId: 'lisans_2027',
  autoClearMistakes: true,
};

/**
 * Results are scoped to the device profile so switching accounts cannot inherit
 * another member's used quota. MembershipContext keeps this value current.
 */
let localMemberId: string | null = null;
/** Membership layer registers itself here so every finished test is mirrored to Supabase. */
let testCompletionListener:
  | ((courseId: CourseId | 'genel', summary: { total: number; correct: number; wrong: number }) => void)
  | null = null;
export function setTestCompletionListener(
  fn: ((courseId: CourseId | 'genel', summary: { total: number; correct: number; wrong: number }) => void) | null
): void {
  testCompletionListener = fn;
}
export function setLocalMemberId(id: string | null): void {
  localMemberId = id;
}
function getLocalMemberId(): string | undefined {
  return localMemberId ?? undefined;
}

function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function getYesterdayKey(): string {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

interface AppContextValue {
  isHydrated: boolean;
  catalog: Record<CourseId, TopicMeta[]>;
  dailyTips: string[];
  results: Record<string, TestResult>;
  mistakes: SavedQuestion[];
  favorites: SavedQuestion[];
  studiedTopics: Record<string, boolean>;
  learnedTips: Record<string, boolean>;
  savedTips: Record<string, boolean>;
  streak: StreakData;
  todayStats: DailyStats;
  totalFocusMinutes: number;
  settings: UserSettings;

  refreshCourse: (courseId: CourseId) => Promise<void>;
  refreshAllCourses: (strict?: boolean) => Promise<void>;
  refreshTips: () => Promise<void>;
  toggleFavorite: (q: Question) => void;
  isFavorite: (questionId: string) => boolean;
  removeMistake: (questionId: string) => void;
  clearMistakesByCourse: (courseId?: CourseId) => void;
  toggleTopicStudied: (topicDocId: string) => void;
  resetTopicResults: (topicDocId: string) => void;
  toggleTipLearned: (tip: string) => void;
  toggleTipSaved: (tip: string) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  recordFocusMinutes: (minutes: number) => void;
  /** Merges cloud-mirrored test entries so a fresh device cannot dodge the free quota. */
  updateResultsWithMember: (incoming: Record<string, TestResult>) => void;
  finalizeQuizSession: (
    session: QuizSessionPayload,
    answers: Record<number, number>,
    durationSec: number
  ) => QuizResultPayload;
  resetAllProgress: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [catalog, setCatalog] = useState<Record<CourseId, TopicMeta[]>>(getInitialCatalog);
  const [dailyTips, setDailyTips] = useState<string[]>(() =>
    applyAdminTips(INITIAL_DAILY_TIPS)
  );
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [mistakes, setMistakes] = useState<SavedQuestion[]>([]);
  const [favorites, setFavorites] = useState<SavedQuestion[]>([]);
  const [studiedTopics, setStudiedTopics] = useState<Record<string, boolean>>({});
  const [learnedTips, setLearnedTips] = useState<Record<string, boolean>>({});
  const [savedTips, setSavedTips] = useState<Record<string, boolean>>({});
  const [streak, setStreak] = useState<StreakData>({
    current: 0,
    best: 0,
    lastDate: null,
  });
  const [todayStats, setTodayStats] = useState<DailyStats>({
    date: getTodayKey(),
    solved: 0,
    correct: 0,
    wrong: 0,
    focusMinutes: 0,
  });
  const [totalFocusMinutes, setTotalFocusMinutes] = useState<number>(0);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [adminRevision, setAdminRevision] = useState(0);
  const tipsRequestRef = useRef(0);
  const hasCloudTipsRef = useRef(false);

  const refreshTips = useCallback(async () => {
    const request = ++tipsRequestRef.current;
    const tips = await fetchCloudDailyTips();
    if (request !== tipsRequestRef.current || tips === null) return;
    hasCloudTipsRef.current = true;
    setDailyTips(tips);
  }, []);

  /**
   * TEK yazma kapısı: yerel anahtar yalnız OKUMA ÖNBELLEĞİDİR; veri aynı anda
   * Supabase'e de gider (üye bağlıysa). Kuyruk/bekletme yok — yazma anlık istektir
   * ve reddedilirse durum akışından görünür olur.
   */
  const pendingRef = useRef<Record<string, unknown>>({});
  const revisionsRef = useRef<Record<string, number>>({});
  const resultSnapshotRef = useRef<Record<string, TestResult>>({});
  const resultDesiredRef = useRef<Record<string, TestResult>>({});
  const [binding, setBinding] = useState<MemberBinding | null>(currentBinding);
  const persistLocal = useCallback((key: string, value: unknown) => {
    const owner = currentBinding();
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    AsyncStorage.setItem(personalCacheKey(key, owner), raw).catch(() => {});
    const kind = STORAGE_KIND[key] as UserDataKind | undefined;
    const revision = (revisionsRef.current[key] || 0) + 1;
    revisionsRef.current[key] = revision;
    if (!owner) return;
    pendingRef.current[key] = value;
    const nextResults = key === STORAGE_KEYS.RESULTS && value && typeof value === 'object'
      ? value as Record<string, TestResult> : null;
    const request = kind ? pushUserData(kind, value)
      : nextResults ? syncUserTestChanges(resultSnapshotRef.current, nextResults, resultDesiredRef.current) : null;
    if (nextResults) resultDesiredRef.current = nextResults;
    if (request) void request.then(res => {
      if (res.ok && currentBinding()?.email === owner.email && currentBinding()?.userId === owner.userId
          && revisionsRef.current[key] === revision) {
        if (nextResults) resultSnapshotRef.current = nextResults;
        delete pendingRef.current[key];
      }
    });
  }, []);

  // Binding changes are independent of write-status updates: a successful read
  // must never cause another read (or a write of the just-read results).
  useEffect(() => {
    const unsubscribe = subscribeBinding(() => setBinding(currentBinding()));
    setBinding(currentBinding());
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    let cacheReady = false;
    let refreshPending = false;
    pendingRef.current = {};
    revisionsRef.current = {};
    resultSnapshotRef.current = {};
    resultDesiredRef.current = {};
    const keys = Object.values(STORAGE_KEYS);
    const defaults: Record<string, unknown> = {
      [STORAGE_KEYS.RESULTS]: {}, [STORAGE_KEYS.MISTAKES]: [], [STORAGE_KEYS.FAVORITES]: [],
      [STORAGE_KEYS.STUDIED_TOPICS]: {}, [STORAGE_KEYS.LEARNED_TIPS]: {}, [STORAGE_KEYS.SAVED_TIPS]: {},
      [STORAGE_KEYS.STREAK]: { current: 0, best: 0, lastDate: null },
      [STORAGE_KEYS.DAILY_STATS]: { date: getTodayKey(), solved: 0, correct: 0, wrong: 0, focusMinutes: 0 },
      [STORAGE_KEYS.FOCUS_TOTAL]: 0, [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
    };
    const apply = (key: string, value: any) => {
      if (value == null) return;
      switch (key) {
        case STORAGE_KEYS.RESULTS: resultSnapshotRef.current = value; resultDesiredRef.current = value; setResults(value); break;
        case STORAGE_KEYS.MISTAKES: setMistakes(value); break;
        case STORAGE_KEYS.FAVORITES: setFavorites(value); break;
        case STORAGE_KEYS.STUDIED_TOPICS: setStudiedTopics(value); break;
        case STORAGE_KEYS.LEARNED_TIPS: setLearnedTips(value); break;
        case STORAGE_KEYS.SAVED_TIPS: setSavedTips(value); break;
        case STORAGE_KEYS.STREAK:
          setStreak(value.lastDate && value.lastDate !== getTodayKey() && value.lastDate !== getYesterdayKey()
            ? { ...value, current: 0 } : value); break;
        case STORAGE_KEYS.DAILY_STATS:
          setTodayStats(value.date === getTodayKey() ? value : defaults[key] as DailyStats); break;
        case STORAGE_KEYS.FOCUS_TOTAL: setTotalFocusMinutes(Number(value) || 0); break;
        case STORAGE_KEYS.SETTINGS: setSettings({ ...DEFAULT_SETTINGS, ...value }); break;
      }
    };
    const initialRevisions = { ...revisionsRef.current };
    keys.forEach(key => apply(key, defaults[key]));
    const refresh = async () => {
      if (!binding?.email || cancelled) return;
      if (!cacheReady) { refreshPending = true; return; }
      const request = ++requestId;
      const versions = { ...revisionsRef.current };
      const response = await pullUserData();
      if (cancelled || request !== requestId) return;
      if (!response.ok || !response.data) { finishPersonalLoad(binding, false); return; }
      const data = response.data;
      for (const key of keys) {
        const kind = STORAGE_KIND[key];
        let value: unknown = kind ? data[kind] : undefined;
        if (key === STORAGE_KEYS.RESULTS && Array.isArray(data.results)) {
          value = Object.fromEntries(data.results.filter(row => row?.key).map(row => [row.key, row]));
        }
        if (value === undefined || value === null || key in pendingRef.current ||
            (versions[key] || 0) !== (revisionsRef.current[key] || 0)) continue;
        apply(key, value);
        void AsyncStorage.setItem(personalCacheKey(key, binding), JSON.stringify(value)).catch(() => {});
      }
      finishPersonalLoad(binding, true);
    };
    const stopWatching = binding ? watchUserData(binding, () => void refresh()) : () => {};
    const stopReload = subscribePersonalReload(requested => {
      if (binding?.email === requested.email && binding?.userId === requested.userId) void refresh();
    });
    void (async () => {
      const entries = await Promise.all(keys.map(async key => [key, await AsyncStorage.getItem(personalCacheKey(key, binding))] as const));
      if (cancelled) return;
      for (const [key, raw] of entries) {
        if (!raw || (initialRevisions[key] || 0) !== (revisionsRef.current[key] || 0)) continue;
        try { apply(key, JSON.parse(raw)); } catch { /* ignore a damaged cache entry */ }
      }
      cacheReady = true;
      setIsHydrated(true);
      if (binding || refreshPending) void refresh();
    })().catch(() => { if (!cancelled) { cacheReady = true; setIsHydrated(true); void refresh(); } });
    return () => { cancelled = true; stopWatching(); stopReload(); };
  }, [binding]);

  // The admin panel is a second source of truth for content. Whenever it
  // mutates (or finishes hydrating) we re-resolve the catalog and tips.
  useEffect(() => subscribeAdmin(() => setAdminRevision(getAdminState().revision)), []);

  useEffect(() => {
    if (adminRevision === 0) return;
    setCatalog(getInitialCatalog());
    if (!hasCloudTipsRef.current) setDailyTips(applyAdminTips(INITIAL_DAILY_TIPS));
  }, [adminRevision]);

  const refreshCourse = useCallback(async (courseId: CourseId) => {
    const updated = await refreshCourseTopics(courseId);
    setCatalog(prev => ({ ...prev, [courseId]: updated }));
  }, []);

  /**
   * Re-reads every course (used right after an admin override is cleared so the
   * live cloud content shows up immediately instead of the stale in-memory copy).
   */
  const refreshAllCourses = useCallback(async (strict = false) => {
    try {
      const [entries] = await Promise.all([
        Promise.all(ALL_COURSE_IDS.map(async id => [id, await refreshCourseTopics(id, strict)] as const)),
        refreshTips(),
      ]);
      setCatalog(prev => {
        const next = { ...prev };
        entries.forEach(([id, topics]) => {
          next[id] = topics;
        });
        return next;
      });
    } catch (error) {
      if (strict) throw error;
      // keep whatever is cached
    }
  }, [refreshTips]);

  // Serialize invalidations: an event during a fetch schedules one more pass.
  useEffect(() => {
    let stopped = false;
    let running = false;
    let pending = false;
    const update = async () => {
      invalidateLiveContent();
      void refreshTips();
      pending = true;
      if (running) return;
      running = true;
      while (pending && !stopped) {
        pending = false;
        const entries = await Promise.all(
          ALL_COURSE_IDS.map(async id => [id, await refreshCourseTopics(id)] as const)
        );
        if (!stopped && !pending) {
          setCatalog(prev => {
            const next = { ...prev };
            entries.forEach(([id, topics]) => { next[id] = topics; });
            return next;
          });
        }
      }
      running = false;
    };
    const unsubscribe = watchContentUpdates(() => { void update(); });
    void update();
    return () => { stopped = true; unsubscribe(); };
  }, [refreshTips]);

  const toggleFavorite = useCallback((q: Question) => {
    setFavorites(prev => {
      const exists = prev.some(item => String(item.id) === String(q.id));
      const next = exists
        ? prev.filter(item => String(item.id) !== String(q.id))
        : [{ ...q, savedAt: new Date().toISOString() }, ...prev];
      persistLocal(STORAGE_KEYS.FAVORITES, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (questionId: string) => favorites.some(f => String(f.id) === String(questionId)),
    [favorites]
  );

  const removeMistake = useCallback((questionId: string) => {
    setMistakes(prev => {
      const next = prev.filter(m => String(m.id) !== String(questionId));
      persistLocal(STORAGE_KEYS.MISTAKES, next);
      return next;
    });
  }, []);

  const clearMistakesByCourse = useCallback((courseId?: CourseId) => {
    setMistakes(prev => {
      const next = courseId ? prev.filter(m => m.courseId !== courseId) : [];
      persistLocal(STORAGE_KEYS.MISTAKES, next);
      return next;
    });
  }, []);

  const toggleTopicStudied = useCallback((topicDocId: string) => {
    setStudiedTopics(prev => {
      const next = { ...prev, [topicDocId]: !prev[topicDocId] };
      persistLocal(STORAGE_KEYS.STUDIED_TOPICS, next);
      return next;
    });
  }, []);

  const resetTopicResults = useCallback((topicDocId: string) => {
    setResults(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(`${topicDocId}_`) || next[k]?.topicDocId === topicDocId) {
          delete next[k];
        }
      });
      persistLocal(STORAGE_KEYS.RESULTS, next);
      return next;
    });
  }, []);

  const toggleTipLearned = useCallback((tip: string) => {
    setLearnedTips(prev => {
      const next = { ...prev, [tip]: !prev[tip] };
      persistLocal(STORAGE_KEYS.LEARNED_TIPS, next);
      return next;
    });
  }, []);

  const toggleTipSaved = useCallback((tip: string) => {
    setSavedTips(prev => {
      const next = { ...prev, [tip]: !prev[tip] };
      persistLocal(STORAGE_KEYS.SAVED_TIPS, next);
      return next;
    });
  }, []);

  const updateResultsWithMember = useCallback((incoming: Record<string, TestResult>) => {
    setResults(prev => {
      const next = { ...prev };
      Object.entries(incoming).forEach(([key, value]) => {
        if (!next[key]) next[key] = value;
      });
      persistLocal(STORAGE_KEYS.RESULTS, next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      persistLocal(STORAGE_KEYS.SETTINGS, next);
      return next;
    });
  }, []);

  const bumpStreakIfNeeded = useCallback(() => {
    if (getAdminState().settings.featureFlags.streak === false) return;
    const today = getTodayKey();
    const yesterday = getYesterdayKey();
    setStreak(prev => {
      if (prev.lastDate === today) return prev;
      const nextCurrent = prev.lastDate === yesterday ? (prev.current || 0) + 1 : 1;
      const nextBest = Math.max(nextCurrent, prev.best || 0);
      const next: StreakData = {
        current: nextCurrent,
        best: nextBest,
        lastDate: today,
      };
      persistLocal(STORAGE_KEYS.STREAK, next);
      return next;
    });
  }, []);

  const recordFocusMinutes = useCallback(
    (minutes: number) => {
      if (minutes <= 0) return;
      bumpStreakIfNeeded();
      setTotalFocusMinutes(prev => {
        const next = prev + minutes;
        persistLocal(STORAGE_KEYS.FOCUS_TOTAL, next);
        return next;
      });
      const today = getTodayKey();
      setTodayStats(prev => {
        const base =
          prev.date === today
            ? prev
            : { date: today, solved: 0, correct: 0, wrong: 0, focusMinutes: 0 };
        const next = { ...base, focusMinutes: base.focusMinutes + minutes };
        persistLocal(STORAGE_KEYS.DAILY_STATS, next);
        return next;
      });
    },
    [bumpStreakIfNeeded]
  );

  const finalizeQuizSession = useCallback(
    (
      session: QuizSessionPayload,
      answers: Record<number, number>,
      durationSec: number
    ): QuizResultPayload => {
      let correct = 0;
      let wrong = 0;
      let blank = 0;
      const newlyWrong: Question[] = [];
      const answeredRightIds = new Set<string>();

      session.questions.forEach((q, index) => {
        const chosen = answers[index];
        if (chosen === undefined || chosen === null) {
          blank += 1;
        } else if (chosen === q.answer) {
          correct += 1;
          answeredRightIds.add(String(q.id));
        } else {
          wrong += 1;
          newlyWrong.push(q);
        }
      });

      const net = calcKpssNet(correct, wrong);
      const answeredCount = correct + wrong;

      if (answeredCount > 0) {
        bumpStreakIfNeeded();
      }

      // Update today's stats
      const today = getTodayKey();
      setTodayStats(prev => {
        const base =
          prev.date === today
            ? prev
            : { date: today, solved: 0, correct: 0, wrong: 0, focusMinutes: 0 };
        const next: DailyStats = {
          ...base,
          solved: base.solved + answeredCount,
          correct: base.correct + correct,
          wrong: base.wrong + wrong,
        };
        persistLocal(STORAGE_KEYS.DAILY_STATS, next);
        return next;
      });

      // Save TestResult if normal/mixed mode with resultKey (or log synthetic history key)
      const saveKey =
        session.resultKey ||
        (session.mode === 'mixed' ? `mixed_${Date.now()}` : undefined);

      if (saveKey) {
        const newResult: TestResult = {
          key: saveKey,
          courseId: session.courseId,
          topicDocId: session.topicDocId,
          // Quota follows the account, so every result carries its owner (guest included).
          memberId: getLocalMemberId() ?? undefined,
          title: session.title,
          correct,
          wrong,
          blank,
          total: session.questions.length,
          net,
          durationSec,
          completedAt: new Date().toISOString(),
        };
        setResults(prev => {
          const next = { ...prev, [saveKey]: newResult };
          persistLocal(STORAGE_KEYS.RESULTS, next);
          return next;
        });
        testCompletionListener?.(session.courseId, {
          total: session.questions.length,
          correct,
          wrong,
        });
      }

      // Update mistakes: add newly wrong questions; optionally clear mastered mistakes
      let clearedMistakeCount = 0;
      const shouldAutoClear =
        session.mode === 'mistake' &&
        (session.autoClearMistakes ?? settings.autoClearMistakes);

      const mistakesEnabled = getAdminState().settings.featureFlags.mistakes !== false;

      setMistakes(prev => {
        let nextList = [...prev];

        if (!mistakesEnabled) {
          persistLocal(STORAGE_KEYS.MISTAKES, nextList);
          return nextList;
        }

        if (shouldAutoClear && answeredRightIds.size > 0) {
          const beforeLen = nextList.length;
          nextList = nextList.filter(m => !answeredRightIds.has(String(m.id)));
          clearedMistakeCount = beforeLen - nextList.length;
        }

        for (const wq of newlyWrong) {
          const existingIdx = nextList.findIndex(m => String(m.id) === String(wq.id));
          if (existingIdx >= 0) {
            nextList[existingIdx] = {
              ...nextList[existingIdx],
              savedAt: new Date().toISOString(),
              wrongCount: (nextList[existingIdx].wrongCount || 1) + 1,
            };
          } else {
            nextList.unshift({
              ...wq,
              savedAt: new Date().toISOString(),
              wrongCount: 1,
            });
          }
        }

        // Cap at 500 to keep storage light and fast
        const trimmed = nextList.slice(0, 500);
        persistLocal(STORAGE_KEYS.MISTAKES, trimmed);
        return trimmed;
      });

      return {
        session,
        answers,
        durationSec,
        correct,
        wrong,
        blank,
        net,
        clearedMistakeCount,
      };
    },
    [bumpStreakIfNeeded, settings.autoClearMistakes]
  );

  const resetAllProgress = useCallback(async () => {
    const keysToClear = [
      STORAGE_KEYS.RESULTS,
      STORAGE_KEYS.MISTAKES,
      STORAGE_KEYS.FAVORITES,
      STORAGE_KEYS.STUDIED_TOPICS,
      STORAGE_KEYS.LEARNED_TIPS,
      STORAGE_KEYS.SAVED_TIPS,
      STORAGE_KEYS.STREAK,
      STORAGE_KEYS.DAILY_STATS,
      STORAGE_KEYS.FOCUS_TOTAL,
    ];
    const empty: Record<string, unknown> = {
      [STORAGE_KEYS.RESULTS]: {}, [STORAGE_KEYS.MISTAKES]: [], [STORAGE_KEYS.FAVORITES]: [],
      [STORAGE_KEYS.STUDIED_TOPICS]: {}, [STORAGE_KEYS.LEARNED_TIPS]: {}, [STORAGE_KEYS.SAVED_TIPS]: {},
      [STORAGE_KEYS.STREAK]: { current: 0, best: 0, lastDate: null },
      [STORAGE_KEYS.DAILY_STATS]: { date: getTodayKey(), solved: 0, correct: 0, wrong: 0, focusMinutes: 0 },
      [STORAGE_KEYS.FOCUS_TOTAL]: 0,
    };
    keysToClear.forEach(key => persistLocal(key, empty[key]));
    setResults({});
    setMistakes([]);
    setFavorites([]);
    setStudiedTopics({});
    setLearnedTips({});
    setSavedTips({});
    setStreak({ current: 0, best: 0, lastDate: null });
    setTodayStats({
      date: getTodayKey(),
      solved: 0,
      correct: 0,
      wrong: 0,
      focusMinutes: 0,
    });
    setTotalFocusMinutes(0);
  }, []);

  const value = useMemo(
    () => ({
      isHydrated,
      catalog,
      dailyTips,
      results,
      mistakes,
      favorites,
      studiedTopics,
      learnedTips,
      savedTips,
      streak,
      todayStats,
      totalFocusMinutes,
      settings,
      refreshCourse,
      refreshAllCourses,
      refreshTips,
      toggleFavorite,
      isFavorite,
      removeMistake,
      clearMistakesByCourse,
      toggleTopicStudied,
      resetTopicResults,
      toggleTipLearned,
      toggleTipSaved,
      updateSettings,
      recordFocusMinutes,
      updateResultsWithMember,
      finalizeQuizSession,
      resetAllProgress,
    }),
    [
      isHydrated,
      catalog,
      dailyTips,
      results,
      mistakes,
      favorites,
      studiedTopics,
      learnedTips,
      savedTips,
      streak,
      todayStats,
      totalFocusMinutes,
      settings,
      refreshCourse,
      refreshAllCourses,
      refreshTips,
      toggleFavorite,
      isFavorite,
      removeMistake,
      clearMistakesByCourse,
      toggleTopicStudied,
      resetTopicResults,
      toggleTipLearned,
      toggleTipSaved,
      updateSettings,
      recordFocusMinutes,
      updateResultsWithMember,
      finalizeQuizSession,
      resetAllProgress,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
};
