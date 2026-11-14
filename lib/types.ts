export type CourseId = 'tarih' | 'cografya' | 'turkce' | 'vatandaslik' | 'guncel';

export interface CourseConfig {
  id: CourseId;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: string;
  accentLight: string;
  accentDark: string;
  softBgLight: string;
  softBgDark: string;
}

export interface TopicMeta {
  docId: string;
  id: string;
  name: string;
  questionCount: number;
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  courseId: CourseId;
  topicDocId?: string;
  topicName?: string;
}

export interface SavedQuestion extends Question {
  savedAt: string;
  wrongCount?: number;
}

export interface TestResult {
  key: string;
  courseId: CourseId | 'genel';
  topicDocId?: string;
  title: string;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  net: number;
  durationSec: number;
  completedAt: string;
  /** Owning device-profile id; lets the quota follow the account, not the app. */
  memberId?: string;
}

export interface StreakData {
  current: number;
  best: number;
  lastDate: string | null;
}

export interface DailyStats {
  date: string;
  solved: number;
  correct: number;
  wrong: number;
  focusMinutes: number;
}

export type QuizMode = 'normal' | 'mistake' | 'favorite' | 'mixed';

export interface QuizSessionPayload {
  title: string;
  courseId: CourseId | 'genel';
  topicDocId?: string;
  testIndex?: number;
  totalTestsInTopic?: number;
  resultKey?: string;
  mode: QuizMode;
  questions: Question[];
  timedMinutes?: number | null;
  autoClearMistakes?: boolean;
}

export interface QuizResultPayload {
  session: QuizSessionPayload;
  answers: Record<number, number>;
  durationSec: number;
  correct: number;
  wrong: number;
  blank: number;
  net: number;
  clearedMistakeCount: number;
}

export type AuthRouteMode = 'giris' | 'uye-ol' | 'sifremi-unuttum' | 'yeni-sifre';

export type RootStackParamList = {
  MainTabs: undefined;
  CourseTopics: { courseId?: CourseId } | undefined;
  Quiz: { session?: QuizSessionPayload } | undefined;
  QuizResult: { result?: QuizResultPayload } | undefined;
  AdminLogin: undefined;
  AdminPanel: undefined;
  AdminTopics: { courseId?: CourseId; focusDocId?: string } | undefined;
  AdminQuestions: { courseId?: CourseId; topicDocId?: string } | undefined;
  AdminUsers: undefined;
  AdminTips: undefined;
  AdminCourses: undefined;
  AdminSettings: undefined;
  AdminMembership: undefined;
  Auth: { mode?: AuthRouteMode } | undefined;
  Profile: undefined;
  MembershipPaywall: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  TipsTab: undefined;
  ReviewTab: undefined;
  FocusStatsTab: undefined;
};
