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
  fetchLiveDailyTips,
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
  pushUserTests,
  subscribeUserData,
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
  refreshAllCourses: () => Promise<void>;
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
  const tipsBaseRef = useRef<string[]>(INITIAL_DAILY_TIPS);

  /**
   * TEK yazma kapısı: yerel anahtar yalnız OKUMA ÖNBELLEĞİDİR; veri aynı anda
   * Supabase'e de gider (üye bağlıysa). Kuyruk/bekletme yok — yazma anlık istektir
   * ve reddedilirse durum akışından görünür olur.
   */
  const pendingRef = useRef<Record<string, unknown>>({});
  const persistLocal = useCallback((key: string, value: unknown) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    AsyncStorage.setItem(key, raw).catch(() => {});
    const kind = STORAGE_KIND[key] as UserDataKind | undefined;
    pendingRef.current[key] = value;
    if (kind) void pushUserData(kind, value);
    if (key === STORAGE_KEYS.RESULTS && value && typeof value === 'object') {
      void pushUserTests(Object.values(value as Record<string, unknown>) as never);
    }
  }, []);

  // Üyelik oturumu bağlandığında bulut asıldır: önbellek buluttakiyle yenilenir.
  // (Bağlantıyı MembershipContext kurar; buradan import YOK — döngü olmaz.)
  const [cloudTick, setCloudTick] = useState(0);
  useEffect(() => subscribeUserData(() => setCloudTick(t => t + 1)), []);
  useEffect(() => {
    let cancelled = false;
    const binding = currentBinding();
    (async () => {
      if (!binding?.email) return;
      const res = await pullUserData();
      if (cancelled || !res.ok || !res.data) return;
      const d = res.data;
      const apply = (key: string, value: unknown, set: (v: never) => void) => {
        if (value === undefined || value === null) return;
        set(value as never);
        AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
      };
      apply(STORAGE_KEYS.MISTAKES, d.mistakes, setMistakes as never);
      apply(STORAGE_KEYS.FAVORITES, d.favorites, setFavorites as never);
      apply(STORAGE_KEYS.STUDIED_TOPICS, d.studiedTopics, setStudiedTopics as never);
      apply(STORAGE_KEYS.LEARNED_TIPS, d.learnedTips, setLearnedTips as never);
      apply(STORAGE_KEYS.SAVED_TIPS, d.savedTips, setSavedTips as never);
      apply(STORAGE_KEYS.DAILY_STATS, d.dailyStats, setTodayStats as never);
      apply(STORAGE_KEYS.SETTINGS, d.settings, setSettings as never);
      if (Array.isArray(d.results)) {
        const map: Record<string, TestResult> = {};
        for (const row of d.results) if (row?.key) map[row.key] = row;
        setResults(map);
        persistLocal(STORAGE_KEYS.RESULTS, map);
      } else if (Object.keys(pendingRef.current).length === 0) {
        // Bulutta hiç satır yoksa bu cihazdaki ilk kullanım olabilir: bir kez yukarı
        // yüklenir, sonra kaynak her zaman bulut olur.
        for (const [key, value] of Object.entries(pendingRef.current)) {
          const kind = STORAGE_KIND[key] as UserDataKind | undefined;
          if (kind) void pushUserData(kind, value);
        }
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cloudTick]);

  useEffect(() => {
    (async () => {
      try {
        const keysToLoad = [
          STORAGE_KEYS.RESULTS,
          STORAGE_KEYS.MISTAKES,
          STORAGE_KEYS.FAVORITES,
          STORAGE_KEYS.STUDIED_TOPICS,
          STORAGE_KEYS.LEARNED_TIPS,
          STORAGE_KEYS.SAVED_TIPS,
          STORAGE_KEYS.STREAK,
          STORAGE_KEYS.DAILY_STATS,
          STORAGE_KEYS.FOCUS_TOTAL,
          STORAGE_KEYS.SETTINGS,
        ];
        const entries = await Promise.all(
          keysToLoad.map(async k => [k, await AsyncStorage.getItem(k)] as const)
        );
        const map = Object.fromEntries(entries);

        if (map[STORAGE_KEYS.RESULTS]) {
          setResults(JSON.parse(map[STORAGE_KEYS.RESULTS]!));
        }
        if (map[STORAGE_KEYS.MISTAKES]) {
          setMistakes(JSON.parse(map[STORAGE_KEYS.MISTAKES]!));
        }
        if (map[STORAGE_KEYS.FAVORITES]) {
          setFavorites(JSON.parse(map[STORAGE_KEYS.FAVORITES]!));
        }
        if (map[STORAGE_KEYS.STUDIED_TOPICS]) {
          setStudiedTopics(JSON.parse(map[STORAGE_KEYS.STUDIED_TOPICS]!));
        }
        if (map[STORAGE_KEYS.LEARNED_TIPS]) {
          setLearnedTips(JSON.parse(map[STORAGE_KEYS.LEARNED_TIPS]!));
        }
        if (map[STORAGE_KEYS.SAVED_TIPS]) {
          setSavedTips(JSON.parse(map[STORAGE_KEYS.SAVED_TIPS]!));
        }
        if (map[STORAGE_KEYS.STREAK]) {
          const parsedStreak: StreakData = JSON.parse(map[STORAGE_KEYS.STREAK]!);
          const today = getTodayKey();
          const yesterday = getYesterdayKey();
          if (
            parsedStreak.lastDate &&
            parsedStreak.lastDate !== today &&
            parsedStreak.lastDate !== yesterday
          ) {
            setStreak({ ...parsedStreak, current: 0 });
          } else {
            setStreak(parsedStreak);
          }
        }
        if (map[STORAGE_KEYS.DAILY_STATS]) {
          const parsedDaily: DailyStats = JSON.parse(map[STORAGE_KEYS.DAILY_STATS]!);
          if (parsedDaily.date === getTodayKey()) {
            setTodayStats(parsedDaily);
          }
        }
        if (map[STORAGE_KEYS.FOCUS_TOTAL]) {
          setTotalFocusMinutes(Number(map[STORAGE_KEYS.FOCUS_TOTAL]) || 0);
        }
        if (map[STORAGE_KEYS.SETTINGS]) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(map[STORAGE_KEYS.SETTINGS]!) });
        } else {
          // No personal choice yet — respect the admin-defined defaults.
          const adminSettings = getAdminState().settings;
          setSettings(prev => ({ ...prev, dailyGoal: adminSettings.dailyGoalDefault }));
        }
      } catch {
        // Ignore storage read errors
      } finally {
        setIsHydrated(true);
      }
    })();

    // Sync live daily tips from kpssasistani.com in background
    fetchLiveDailyTips()
      .then(liveTips => {
        if (liveTips && liveTips.length > 0) {
          tipsBaseRef.current = liveTips;
          setDailyTips(applyAdminTips(liveTips));
        }
      })
      .catch(() => {});
  }, []);

  // The admin panel is a second source of truth for content. Whenever it
  // mutates (or finishes hydrating) we re-resolve the catalog and tips.
  useEffect(() => subscribeAdmin(() => setAdminRevision(getAdminState().revision)), []);

  useEffect(() => {
    if (adminRevision === 0) return;
    setCatalog(getInitialCatalog());
    setDailyTips(applyAdminTips(tipsBaseRef.current));
  }, [adminRevision]);

  const refreshCourse = useCallback(async (courseId: CourseId) => {
    const updated = await refreshCourseTopics(courseId);
    setCatalog(prev => ({ ...prev, [courseId]: updated }));
  }, []);

  /**
   * Re-reads every course (used right after an admin override is cleared so the
   * live cloud content shows up immediately instead of the stale in-memory copy).
   */
  const refreshAllCourses = useCallback(async () => {
    try {
      const entries = await Promise.all(
        ALL_COURSE_IDS.map(async id => [id, await refreshCourseTopics(id)] as const)
      );
      setCatalog(prev => {
        const next = { ...prev };
        entries.forEach(([id, topics]) => {
          next[id] = topics;
        });
        return next;
      });
      const tips = await fetchLiveDailyTips();
      if (tips.length > 0) {
        tipsBaseRef.current = tips;
        setDailyTips(applyAdminTips(tips));
      }
    } catch {
      // keep whatever is cached
    }
  }, []);

  const refreshTips = useCallback(async () => {
    const updated = await fetchLiveDailyTips();
    if (updated.length > 0) {
      tipsBaseRef.current = updated;
      setDailyTips(applyAdminTips(updated));
    }
  }, []);

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
    await Promise.all(keysToClear.map(k => AsyncStorage.removeItem(k)));
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
