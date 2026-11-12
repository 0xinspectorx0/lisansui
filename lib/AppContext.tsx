import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { INITIAL_DAILY_TIPS } from './seedData';
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
  const [dailyTips, setDailyTips] = useState<string[]>(INITIAL_DAILY_TIPS);
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
          setDailyTips(liveTips);
        }
      })
      .catch(() => {});
  }, []);

  const refreshCourse = useCallback(async (courseId: CourseId) => {
    const updated = await refreshCourseTopics(courseId);
    setCatalog(prev => ({ ...prev, [courseId]: updated }));
  }, []);

  const refreshTips = useCallback(async () => {
    const updated = await fetchLiveDailyTips();
    if (updated.length > 0) {
      setDailyTips(updated);
    }
  }, []);

  const toggleFavorite = useCallback((q: Question) => {
    setFavorites(prev => {
      const exists = prev.some(item => String(item.id) === String(q.id));
      const next = exists
        ? prev.filter(item => String(item.id) !== String(q.id))
        : [{ ...q, savedAt: new Date().toISOString() }, ...prev];
      AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(next)).catch(() => {});
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
      AsyncStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearMistakesByCourse = useCallback((courseId?: CourseId) => {
    setMistakes(prev => {
      const next = courseId ? prev.filter(m => m.courseId !== courseId) : [];
      AsyncStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleTopicStudied = useCallback((topicDocId: string) => {
    setStudiedTopics(prev => {
      const next = { ...prev, [topicDocId]: !prev[topicDocId] };
      AsyncStorage.setItem(STORAGE_KEYS.STUDIED_TOPICS, JSON.stringify(next)).catch(
        () => {}
      );
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
      AsyncStorage.setItem(STORAGE_KEYS.RESULTS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleTipLearned = useCallback((tip: string) => {
    setLearnedTips(prev => {
      const next = { ...prev, [tip]: !prev[tip] };
      AsyncStorage.setItem(STORAGE_KEYS.LEARNED_TIPS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleTipSaved = useCallback((tip: string) => {
    setSavedTips(prev => {
      const next = { ...prev, [tip]: !prev[tip] };
      AsyncStorage.setItem(STORAGE_KEYS.SAVED_TIPS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const bumpStreakIfNeeded = useCallback(() => {
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
      AsyncStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const recordFocusMinutes = useCallback(
    (minutes: number) => {
      if (minutes <= 0) return;
      bumpStreakIfNeeded();
      setTotalFocusMinutes(prev => {
        const next = prev + minutes;
        AsyncStorage.setItem(STORAGE_KEYS.FOCUS_TOTAL, String(next)).catch(() => {});
        return next;
      });
      const today = getTodayKey();
      setTodayStats(prev => {
        const base =
          prev.date === today
            ? prev
            : { date: today, solved: 0, correct: 0, wrong: 0, focusMinutes: 0 };
        const next = { ...base, focusMinutes: base.focusMinutes + minutes };
        AsyncStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(next)).catch(() => {});
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
        AsyncStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(next)).catch(() => {});
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
          AsyncStorage.setItem(STORAGE_KEYS.RESULTS, JSON.stringify(next)).catch(() => {});
          return next;
        });
      }

      // Update mistakes: add newly wrong questions; optionally clear mastered mistakes
      let clearedMistakeCount = 0;
      const shouldAutoClear =
        session.mode === 'mistake' &&
        (session.autoClearMistakes ?? settings.autoClearMistakes);

      setMistakes(prev => {
        let nextList = [...prev];

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
        AsyncStorage.setItem(STORAGE_KEYS.MISTAKES, JSON.stringify(trimmed)).catch(() => {});
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
