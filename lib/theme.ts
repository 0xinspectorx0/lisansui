import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CourseConfig, CourseId } from './types';
import { getAdminState, subscribeAdmin } from './adminStore';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
}

export const LIGHT_COLORS: ThemeColors = {
  isDark: false,
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  primary: '#4F46E5',
  primarySoft: '#EEF2FF',
  success: '#059669',
  successSoft: '#ECFDF5',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#D97706',
  warningSoft: '#FFFBEB',
};

export const DARK_COLORS: ThemeColors = {
  isDark: true,
  background: '#0B1120',
  surface: '#131C2E',
  surfaceSecondary: '#1E293B',
  border: '#1F2A40',
  borderStrong: '#334155',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  primary: '#818CF8',
  primarySoft: 'rgba(129, 140, 248, 0.14)',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
};

export const COURSES: Record<CourseId, CourseConfig> = {
  tarih: {
    id: 'tarih',
    title: 'Tarih',
    shortTitle: 'Tarih',
    subtitle: 'İslamiyet Öncesi, Osmanlı ve İnkılap Tarihi',
    icon: 'library-outline',
    accentLight: '#D97706',
    accentDark: '#FBBF24',
    softBgLight: '#FFFBEB',
    softBgDark: 'rgba(251, 191, 36, 0.14)',
  },
  cografya: {
    id: 'cografya',
    title: 'Coğrafya',
    shortTitle: 'Coğrafya',
    subtitle: 'Fiziki, Beşeri ve Ekonomik Türkiye Coğrafyası',
    icon: 'earth-outline',
    accentLight: '#059669',
    accentDark: '#34D399',
    softBgLight: '#ECFDF5',
    softBgDark: 'rgba(52, 211, 153, 0.14)',
  },
  turkce: {
    id: 'turkce',
    title: 'Türkçe',
    shortTitle: 'Türkçe',
    subtitle: 'Yapı Bilgisi, Dil Bilgisi, Anlam ve Paragraf',
    icon: 'book-outline',
    accentLight: '#E11D48',
    accentDark: '#FB7185',
    softBgLight: '#FFF1F2',
    softBgDark: 'rgba(251, 113, 133, 0.14)',
  },
  vatandaslik: {
    id: 'vatandaslik',
    title: 'Vatandaşlık',
    shortTitle: 'Vatandaşlık',
    subtitle: 'Temel Hukuk, Anayasa ve İdare Hukuku',
    icon: 'shield-checkmark-outline',
    accentLight: '#2563EB',
    accentDark: '#60A5FA',
    softBgLight: '#EFF6FF',
    softBgDark: 'rgba(96, 165, 250, 0.14)',
  },
  guncel: {
    id: 'guncel',
    title: 'Güncel Bilgiler',
    shortTitle: 'Güncel',
    subtitle: 'Türkiye & Dünya Gündemi, Kültür ve Kuruluşlar',
    icon: 'newspaper-outline',
    accentLight: '#7C3AED',
    accentDark: '#A78BFA',
    softBgLight: '#F5F3FF',
    softBgDark: 'rgba(167, 139, 250, 0.14)',
  },
};

export const COURSE_LIST: CourseConfig[] = [
  COURSES.tarih,
  COURSES.cografya,
  COURSES.turkce,
  COURSES.vatandaslik,
  COURSES.guncel,
];

const THEME_STORAGE_KEY = '@kpss_theme_pref_v1';

interface ThemeContextValue {
  colors: ThemeColors;
  preference: ThemePreference;
  toggleTheme: () => void;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LIGHT_COLORS,
  preference: 'system',
  toggleTheme: () => {},
  setPreference: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [preference, setPrefState] = useState<ThemePreference>('light');
  const [userChoseTheme, setUserChoseTheme] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(saved => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setPrefState(saved);
          setUserChoseTheme(true);
        } else {
          // No personal choice yet — fall back to the admin default.
          const adminDefault = getAdminState().settings.defaultTheme;
          if (adminDefault) setPrefState(adminDefault);
        }
      })
      .catch(() => {});
  }, []);

  // Admin can push a default theme; it only applies to users who never picked one.
  useEffect(() => {
    if (userChoseTheme) return undefined;
    return subscribeAdmin(() => {
      setPrefState(getAdminState().settings.defaultTheme);
    });
  }, [userChoseTheme]);

  const setPreference = (pref: ThemePreference) => {
    setPrefState(pref);
    AsyncStorage.setItem(THEME_STORAGE_KEY, pref).catch(() => {});
  };

  const isDark =
    preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  const toggleTheme = () => {
    setPreference(isDark ? 'light' : 'dark');
  };

  const value = useMemo(
    () => ({
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      preference,
      toggleTheme,
      setPreference,
    }),
    [isDark, preference]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
};

export const useAppTheme = () => useContext(ThemeContext);
