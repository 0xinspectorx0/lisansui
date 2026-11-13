import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { COURSE_LIST, useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { VipLockedScreen, useVipLocked } from '../components/admin/VipGate';
import { RootStackParamList } from '../lib/types';
import { calcKpssNet, formatDuration, formatNet } from '../lib/textUtils';

interface TimerPreset {
  id: string;
  label: string;
  minutes: number;
  isBreak?: boolean;
}

const TIMER_PRESETS: TimerPreset[] = [
  { id: 'pomo25', label: '25 dk Odak', minutes: 25 },
  { id: 'deep50', label: '50 dk Blok', minutes: 50 },
  { id: 'kpss130', label: '130 dk KPSS', minutes: 130 },
  { id: 'break5', label: '5 dk Mola', minutes: 5, isBreak: true },
];

export const FocusStatsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    results,
    totalFocusMinutes,
    todayStats,
    recordFocusMinutes,
    resetAllProgress,
  } = useApp();

  const [tab, setTab] = useState<'stats' | 'timer'>('stats');
  const [selectedPreset, setSelectedPreset] = useState<TimerPreset>(TIMER_PRESETS[0]);
  const [secondsLeft, setSecondsLeft] = useState<number>(TIMER_PRESETS[0].minutes * 60);
  const [running, setRunning] = useState(false);
  const [sessionDoneBanner, setSessionDoneBanner] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setRunning(false);
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            ).catch(() => {});
          }
          if (!selectedPreset.isBreak) {
            recordFocusMinutes(selectedPreset.minutes);
            setSessionDoneBanner(
              `${selectedPreset.minutes} dakikalık odak oturumu tamamlandı!`
            );
          } else {
            setSessionDoneBanner('Mola süresi doldu. Yeni bloğa hazırsınız!');
          }
          return selectedPreset.minutes * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, selectedPreset, recordFocusMinutes]);

  const summary = useMemo(() => {
    const list = Object.values(results);
    const totalTests = list.length;
    const correct = list.reduce((s, r) => s + r.correct, 0);
    const wrong = list.reduce((s, r) => s + r.wrong, 0);
    const solved = correct + wrong;
    const net = calcKpssNet(correct, wrong);
    const accuracy = solved > 0 ? Math.round((correct / solved) * 100) : 0;

    const recent = [...list]
      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      )
      .slice(0, 6);

    const perCourse = COURSE_LIST.map(course => {
      const cList = list.filter(r => r.courseId === course.id);
      const cCorrect = cList.reduce((s, r) => s + r.correct, 0);
      const cWrong = cList.reduce((s, r) => s + r.wrong, 0);
      const cAnswered = cCorrect + cWrong;
      const cNet = calcKpssNet(cCorrect, cWrong);
      const cAcc = cAnswered > 0 ? Math.round((cCorrect / cAnswered) * 100) : 0;
      return {
        course,
        tests: cList.length,
        correct: cCorrect,
        wrong: cWrong,
        net: cNet,
        accuracy: cAcc,
      };
    });

    return {
      totalTests,
      solved,
      net,
      accuracy,
      recent,
      perCourse,
    };
  }, [results]);

  const selectPreset = (preset: TimerPreset) => {
    setRunning(false);
    setSessionDoneBanner(null);
    setSelectedPreset(preset);
    setSecondsLeft(preset.minutes * 60);
  };

  const vipLock = useVipLocked('focus');
  if (vipLock) {
    return <VipLockedScreen title="Odak & Analiz" />;
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Odak & Analiz</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          KPSS net takibi ve odak sayacı
        </Text>
      </View>

      {/* Segmented Switcher */}
      <View
        style={[
          styles.segmented,
          { backgroundColor: colors.surfaceSecondary },
        ]}
      >
        <Pressable
          onPress={() => setTab('stats')}
          style={[
            styles.segBtn,
            tab === 'stats' && { backgroundColor: colors.surface },
          ]}
        >
          <Ionicons
            name="bar-chart-outline"
            size={16}
            color={tab === 'stats' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.segBtnText,
              { color: tab === 'stats' ? colors.text : colors.textSecondary },
            ]}
          >
            Analiz & Netler
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setTab('timer')}
          style={[
            styles.segBtn,
            tab === 'timer' && { backgroundColor: colors.surface },
          ]}
        >
          <Ionicons
            name="timer-outline"
            size={16}
            color={tab === 'timer' ? colors.primary : colors.textSecondary}
          />
          <Text
            style={[
              styles.segBtnText,
              { color: tab === 'timer' ? colors.text : colors.textSecondary },
            ]}
          >
            Odak Sayacı
          </Text>
        </Pressable>
      </View>

      {tab === 'stats' ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* KPI Grid */}
          <View style={styles.kpiGrid}>
            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.text }]}>
                {summary.solved}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Çözülen Soru
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.primary }]}>
                {formatNet(summary.net)}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Toplam Net
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.success }]}>
                %{summary.accuracy}
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Genel Başarı
              </Text>
            </View>

            <View
              style={[
                styles.kpiCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.kpiValue, { color: colors.warning }]}>
                {totalFocusMinutes} dk
              </Text>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>
                Odak Süresi
              </Text>
            </View>
          </View>

          {/* Per-Course Breakdown */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Ders Bazlı Başarı
            </Text>

            {summary.perCourse.map(item => {
              const accent = colors.isDark
                ? item.course.accentDark
                : item.course.accentLight;
              return (
                <Pressable
                  key={item.course.id}
                  onPress={() =>
                    navigation.navigate('CourseTopics', {
                      courseId: item.course.id,
                    })
                  }
                  style={styles.courseStatRow}
                >
                  <View style={styles.courseStatTop}>
                    <Text style={[styles.courseStatName, { color: colors.text }]}>
                      {item.course.title}
                    </Text>
                    <Text
                      style={[
                        styles.courseStatNumbers,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {item.tests > 0
                        ? `${item.correct}D ${item.wrong}Y • ${formatNet(
                            item.net
                          )} Net (%${item.accuracy})`
                        : 'Henüz test çözülmedi'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.barTrack,
                      { backgroundColor: colors.surfaceSecondary },
                    ]}
                  >
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${item.accuracy}%`,
                          backgroundColor: accent,
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Recent Solved Tests */}
          {summary.recent.length > 0 && (
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Son Çözülen Testler
              </Text>

              {summary.recent.map(r => (
                <View
                  key={r.key}
                  style={[
                    styles.recentRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={styles.recentInfo}>
                    <Text
                      style={[styles.recentTitle, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {r.title}
                    </Text>
                    <Text
                      style={[styles.recentMeta, { color: colors.textMuted }]}
                    >
                      {r.correct} Doğru • {r.wrong} Yanlış • {r.blank} Boş
                    </Text>
                  </View>
                  <Text style={[styles.recentNet, { color: colors.primary }]}>
                    {formatNet(r.net)} Net
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Reset Progress */}
          {summary.totalTests > 0 && (
            <Pressable
              onPress={() => setResetModalOpen(true)}
              style={[
                styles.resetRowBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.resetRowText, { color: colors.danger }]}>
                Tüm İstatistikleri Sıfırla
              </Text>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.timerContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Presets */}
          <View style={styles.presetGrid}>
            {TIMER_PRESETS.map(p => {
              const active = selectedPreset.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => selectPreset(p)}
                  style={[
                    styles.presetBtn,
                    {
                      backgroundColor: active
                        ? p.isBreak
                          ? colors.success
                          : colors.primary
                        : colors.surface,
                      borderColor: active
                        ? p.isBreak
                          ? colors.success
                          : colors.primary
                        : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      { color: active ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {sessionDoneBanner && (
            <View
              style={[
                styles.doneBanner,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.success}
              />
              <Text style={[styles.doneBannerText, { color: colors.success }]}>
                {sessionDoneBanner}
              </Text>
            </View>
          )}

          {/* Clean Focus Clock */}
          <View
            style={[
              styles.clockCard,
              {
                backgroundColor: colors.surface,
                borderColor: running
                  ? selectedPreset.isBreak
                    ? colors.success
                    : colors.primary
                  : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.clockModeLabel,
                {
                  color: selectedPreset.isBreak
                    ? colors.success
                    : colors.primary,
                },
              ]}
            >
              {selectedPreset.isBreak ? 'MOLA ZAMANI' : 'ODAKLANMA SÜRESİ'}
            </Text>

            <Text style={[styles.clockDigits, { color: colors.text }]}>
              {formatDuration(secondsLeft)}
            </Text>

            <Text style={[styles.clockHint, { color: colors.textSecondary }]}>
              Bugün odaklanılan süre: {todayStats.focusMinutes} dk
            </Text>
          </View>

          {/* Controls */}
          <View style={styles.clockControls}>
            <Pressable
              onPress={() => {
                setSessionDoneBanner(null);
                setRunning(prev => !prev);
              }}
              style={[
                styles.playBtn,
                {
                  backgroundColor: selectedPreset.isBreak
                    ? colors.success
                    : colors.primary,
                },
              ]}
            >
              <Ionicons
                name={running ? 'pause' : 'play'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.playBtnText}>
                {running ? 'Duraklat' : 'Başlat'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setRunning(false);
                setSecondsLeft(selectedPreset.minutes * 60);
              }}
              style={[
                styles.resetClockBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="refresh" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* Reset Confirmation Modal */}
      <Modal
        visible={resetModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Veriler Sıfırlansın mı?
            </Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Çözülen test kayıtları, yanlışlar ve favoriler cihazınızdan
              temizlenecek. Bu işlem geri alınamaz.
            </Text>

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setResetModalOpen(false)}
                style={[
                  styles.modalCancel,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>
                  Vazgeç
                </Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  await resetAllProgress();
                  setResetModalOpen(false);
                }}
                style={[styles.modalDanger, { backgroundColor: colors.danger }]}
              >
                <Text style={styles.modalDangerText}>Evet, Sıfırla</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 18,
    padding: 3,
    borderRadius: 12,
    marginBottom: 12,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  segBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 14,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
    gap: 3,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 13,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  courseStatRow: {
    gap: 6,
  },
  courseStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  courseStatName: {
    fontSize: 14,
    fontWeight: '700',
  },
  courseStatNumbers: {
    fontSize: 12,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  recentInfo: {
    flex: 1,
    gap: 2,
  },
  recentTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  recentMeta: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  recentNet: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  resetRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  resetRowText: {
    fontSize: 13,
    fontWeight: '700',
  },
  timerContainer: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetBtn: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  doneBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  clockCard: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 42,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  clockModeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  clockDigits: {
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  clockHint: {
    fontSize: 13,
    fontWeight: '500',
  },
  clockControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  resetClockBtn: {
    width: 54,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 18,
  },
  modalBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalDanger: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDangerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
