import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { COURSE_LIST, COURSES, useAppTheme } from '../lib/theme';
import { EXAM_PRESETS, useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { VipBadge } from '../components/admin/VipGate';
import { MembershipPill } from '../components/membership/ui';
import { useMembership } from '../lib/MembershipContext';
import {
  CourseId,
  MainTabParamList,
  RootStackParamList,
} from '../lib/types';
import { buildGeneralMixedExam } from '../lib/kpssApi';
import {
  calcKpssNet,
  formatNet,
  prepareQuizQuestions,
} from '../lib/textUtils';
import { CourseCard } from '../components/CourseCard';

const GOAL_OPTIONS = [20, 40, 60, 100, 150];

export const HomeScreen: React.FC = () => {
  const { colors, toggleTheme } = useAppTheme();
  const stackNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const {
    catalog,
    dailyTips,
    results,
    mistakes,
    savedTips,
    toggleTipSaved,
    streak,
    todayStats,
    settings,
    updateSettings,
  } = useApp();
  const admin = useAdmin();
  const membership = useMembership();

  const [tipIndex, setTipIndex] = useState<number>(() =>
    dailyTips.length > 0 ? Math.floor(Math.random() * dailyTips.length) : 0
  );
  const [startingMixed, setStartingMixed] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const totalLiveQuestions = useMemo(() => {
    const visible = new Set(
      (admin.courseOrder.length ? admin.courseOrder : COURSE_LIST.map(c => c.id)).filter(
        id => !admin.hiddenCourses.includes(id)
      )
    );
    return (Object.keys(catalog) as CourseId[]).reduce((sum, id) => {
      if (!visible.has(id)) return sum;
      return sum + catalog[id].reduce((acc, t) => acc + t.questionCount, 0);
    }, 0);
  }, [admin.courseOrder, admin.hiddenCourses, catalog]);

  const selectedExam = useMemo(() => {
    return (
      EXAM_PRESETS.find(p => p.id === settings.examPresetId) || EXAM_PRESETS[0]
    );
  }, [settings.examPresetId]);

  /** Admin can pin a global exam date; otherwise the user's preset wins. */
  const examTargetIso = admin.examDateOverride || selectedExam.dateIso;
  const examLabel = admin.examDateOverride
    ? `${selectedExam.label} • yönetici takvimi`
    : selectedExam.label;

  const daysUntilExam = useMemo(() => {
    const target = new Date(examTargetIso + 'T09:00:00').getTime();
    const now = Date.now();
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [examTargetIso]);

  const todayNet = useMemo(
    () => calcKpssNet(todayStats.correct, todayStats.wrong),
    [todayStats.correct, todayStats.wrong]
  );

  const goalProgress = useMemo(() => {
    if (settings.dailyGoal <= 0) return 0;
    return Math.min(1, todayStats.solved / settings.dailyGoal);
  }, [todayStats.solved, settings.dailyGoal]);

  /** Admin-controlled ordering, visibility and titles for the course cards. */
  const visibleCourses = useMemo(() => {
    const ordered = admin.courseOrder.length
      ? admin.courseOrder
      : COURSE_LIST.map(c => c.id);
    return ordered
      .filter(id => !admin.hiddenCourses.includes(id))
      .map(id => ({
        ...COURSES[id],
        title: admin.courseTitle(id, COURSES[id].title),
      }));
  }, [admin.courseOrder, admin.courseTitle, admin.hiddenCourses]);

  const courseStats = useMemo(() => {
    const allResults = Object.values(results);
    return visibleCourses.map(course => {
      const topics = catalog[course.id] || [];
      const activeTopicsCount = topics.filter(t => t.questionCount > 0).length;
      const totalQuestions = topics.reduce((s, t) => s + t.questionCount, 0);
      const courseResults = allResults.filter(r => r.courseId === course.id);
      const totalCorrect = courseResults.reduce((s, r) => s + r.correct, 0);
      const totalAnswered = courseResults.reduce(
        (s, r) => s + r.correct + r.wrong,
        0
      );
      const accuracyPercent =
        totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

      return {
        course,
        activeTopicsCount,
        totalQuestions,
        solvedTestsCount: courseResults.length,
        accuracyPercent,
      };
    });
  }, [catalog, results, visibleCourses]);

  const quotaSummary = useMemo(() => {
    const ids = (Object.keys(catalog) as CourseId[]).filter(
      id => !admin.hiddenCourses.includes(id)
    );
    if (!membership.quota.enforced || membership.isVip) {
      return { limited: false, blocked: false, text: '' };
    }
    const limit = membership.quota.freeTestsPerCourse;
    const used = ids.map(id => membership.usedFor(id));
    const blockedAll = used.length > 0 && used.every(u => u >= limit);
    const anyLeft = used.some(u => u < limit);
    const coursesBlocked = used.filter(u => u >= limit).length;
    if (blockedAll || !membership.canStartMixed(catalog)) {
      return {
        limited: true,
        blocked: true,
        text: `Ücretsiz hakların bitti — ${ids.length} derste de ${limit} test çözdün`,
      };
    }
    return {
      limited: true,
      blocked: false,
      text:
        coursesBlocked > 0
          ? `${coursesBlocked} derste hakkın bitti • ${anyLeft ? 'açık dersten devam edebilirsin' : ''}`
          : `Her dersten ${limit} ücretsiz test hakkın var`,
    };
  }, [admin.hiddenCourses, catalog, membership]);

  const currentTip = dailyTips[tipIndex % Math.max(1, dailyTips.length)] || '';
  const isCurrentTipSaved = !!savedTips[currentTip];

  const handleStartMixedExam = async () => {
    if (startingMixed) return;
    if (admin.isVipGated('karmaExam')) {
      Alert.alert(
        'Karma Deneme VIP’e özel',
        'Yönetici paneli bu bölümü VIP üyelere ayırdı. Panel → Kullanıcılar bölümünden bu cihaza VIP verebilirsin.'
      );
      return;
    }
    if (!membership.canStartMixed(catalog)) {
      // Free quota exhausted (per-course or the karma slot itself).
      stackNav.navigate('MembershipPaywall');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setStartingMixed(true);
    try {
      const rawQuestions = await buildGeneralMixedExam(catalog, 25);
      const prepared = prepareQuizQuestions(
        rawQuestions,
        admin.settings.quizDefaults.shuffleQuestions,
        admin.settings.quizDefaults.shuffleOptions
      );
      if (prepared.length > 0) {
        stackNav.navigate('Quiz', {
          session: {
            title: 'KPSS Karma Deneme (25 Soru)',
            courseId: 'genel',
            mode: 'mixed',
            questions: prepared,
            timedMinutes: 25,
          },
        });
      }
    } finally {
      setStartingMixed(false);
    }
  };

  const handleStartMistakes = () => {
    if (!admin.featureOn('mistakes')) {
      Alert.alert(
        'Hata defteri kapalı',
        'Yönetici paneli → Uygulama Ayarları bölümünden “Hata defterine yazma” özelliğini açabilirsin.'
      );
      return;
    }
    if (mistakes.length === 0) {
      tabNav.navigate('ReviewTab');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const batch = prepareQuizQuestions(mistakes.slice(0, 20), true, true);
    stackNav.navigate('Quiz', {
      session: {
        title: 'Yanlışlarımı Erit',
        courseId: 'genel',
        mode: 'mistake',
        questions: batch,
        timedMinutes: null,
        autoClearMistakes: settings.autoClearMistakes,
      },
    });
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Clean Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.appTitle, { color: colors.text }]}>
              KPSS Asistanı
            </Text>
            <Text style={[styles.appSub, { color: colors.textSecondary }]}>
              {totalLiveQuestions.toLocaleString('tr-TR')} soru • Sade çalışma alanı
            </Text>
          </View>

          <View style={styles.headerRight}>
            <Pressable
              onPress={() =>
                stackNav.navigate(membership.signedIn ? 'Profile' : 'Auth')
              }
              style={[
                styles.iconBtn,
                {
                  backgroundColor: membership.signedIn
                    ? colors.successSoft
                    : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              hitSlop={8}
            >
              <Ionicons
                name={membership.signedIn ? 'person' : 'person-add-outline'}
                size={19}
                color={membership.signedIn ? colors.success : colors.text}
              />
            </Pressable>
            <VipBadge />
            {admin.featureOn('streak') && streak.current > 0 && (
              <View
                style={[
                  styles.streakPill,
                  {
                    backgroundColor: colors.warningSoft,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons name="flame" size={15} color={colors.warning} />
                <Text style={[styles.streakText, { color: colors.warning }]}>
                  {streak.current} gün
                </Text>
              </View>
            )}

            <Pressable
              onPress={() =>
                stackNav.navigate(admin.unlocked ? 'AdminPanel' : 'AdminLogin')
              }
              style={[
                styles.iconBtn,
                {
                  backgroundColor: admin.unlocked
                    ? colors.primarySoft
                    : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              hitSlop={8}
            >
              <Ionicons
                name={admin.unlocked ? 'shield-checkmark' : 'shield-outline'}
                size={19}
                color={admin.unlocked ? colors.primary : colors.text}
              />
            </Pressable>

            <Pressable
              onPress={toggleTheme}
              style={[
                styles.iconBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              hitSlop={8}
            >
              <Ionicons
                name={colors.isDark ? 'sunny-outline' : 'moon-outline'}
                size={19}
                color={colors.text}
              />
            </Pressable>
          </View>
        </View>

        {/* Admin announcement / maintenance */}
        {(admin.announcement.enabled || admin.maintenanceActive) && (
          <View
            style={[
              styles.adminBanner,
              {
                backgroundColor: admin.maintenanceActive
                  ? colors.dangerSoft
                  : admin.announcement.tone === 'warning'
                  ? colors.warningSoft
                  : admin.announcement.tone === 'success'
                  ? colors.successSoft
                  : colors.primarySoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name={admin.maintenanceActive ? 'construct' : 'megaphone'}
              size={15}
              color={
                admin.maintenanceActive
                  ? colors.danger
                  : admin.announcement.tone === 'warning'
                  ? colors.warning
                  : admin.announcement.tone === 'success'
                  ? colors.success
                  : colors.primary
              }
            />
            <Text
              numberOfLines={2}
              style={[
                styles.adminBannerText,
                {
                  color: admin.maintenanceActive
                    ? colors.danger
                    : colors.textSecondary,
                },
              ]}
            >
              {admin.maintenanceActive
                ? admin.settings.maintenance.message
                : admin.announcement.text}
            </Text>
            <Pressable
              onPress={() => stackNav.navigate('AdminSettings')}
              hitSlop={8}
            >
              <Ionicons name="create-outline" size={15} color={colors.primary} />
            </Pressable>
          </View>
        )}

        {/* Daily Goal & Countdown Card */}
        <Pressable
          onPress={() => setGoalModalOpen(true)}
          style={({ pressed }) => [
            styles.goalCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.94 : 1,
            },
          ]}
        >
          <View style={styles.goalTopRow}>
            <View style={styles.goalTitleGroup}>
              <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>
                BUGÜNKÜ HEDEF
              </Text>
              <View style={styles.goalNumbersRow}>
                <Text style={[styles.goalBig, { color: colors.text }]}>
                  {todayStats.solved}
                </Text>
                <Text style={[styles.goalTarget, { color: colors.textMuted }]}>
                  / {settings.dailyGoal} soru
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.countdownBox,
                { backgroundColor: colors.primarySoft },
              ]}
            >
              <Text style={[styles.countdownDays, { color: colors.primary }]}>
                {daysUntilExam} Gün
              </Text>
              <Text
                style={[styles.countdownLabel, { color: colors.primary }]}
                numberOfLines={1}
              >
                {examLabel}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.surfaceSecondary },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(goalProgress * 100)}%`,
                  backgroundColor:
                    goalProgress >= 1 ? colors.success : colors.primary,
                },
              ]}
            />
          </View>

          <View style={styles.goalFooterRow}>
            <Text style={[styles.goalStatText, { color: colors.textSecondary }]}>
              Bugün: <Text style={{ fontWeight: '700', color: colors.text }}>{todayStats.correct}D {todayStats.wrong}Y</Text> ({formatNet(todayNet)} Net)
            </Text>
            <View style={styles.editGoalLink}>
              <Text style={[styles.editGoalText, { color: colors.primary }]}>
                Hedefi Düzenle
              </Text>
              <Ionicons name="options-outline" size={14} color={colors.primary} />
            </View>
          </View>
        </Pressable>

        {/* 1-Tap Quick Actions */}
        <View style={styles.quickGrid}>
          <Pressable
            onPress={handleStartMixedExam}
            disabled={startingMixed}
            style={({ pressed }) => [
              styles.quickCard,
              {
                backgroundColor: colors.primary,
                opacity: pressed || startingMixed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.quickIconRow}>
              <View style={styles.quickIconWhiteBg}>
                {startingMixed ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="flash" size={18} color="#4F46E5" />
                )}
              </View>
              <Text style={styles.quickPillLight}>25 Soru</Text>
            </View>
            <Text style={styles.quickPrimaryTitle}>Karma Deneme</Text>
            <Text style={styles.quickPrimarySub}>
              5 dersten seçme sorularla hızlı prova
            </Text>
          </Pressable>

          <Pressable
            onPress={handleStartMistakes}
            style={({ pressed }) => [
              styles.quickCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: 1,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.quickIconRow}>
              <View
                style={[
                  styles.quickIconSoft,
                  {
                    backgroundColor:
                      mistakes.length > 0 ? colors.dangerSoft : colors.successSoft,
                  },
                ]}
              >
                <Ionicons
                  name={mistakes.length > 0 ? 'refresh-circle' : 'checkmark-circle'}
                  size={20}
                  color={mistakes.length > 0 ? colors.danger : colors.success}
                />
              </View>
              <Text
                style={[
                  styles.quickCountBadge,
                  {
                    color: mistakes.length > 0 ? colors.danger : colors.success,
                  },
                ]}
              >
                {mistakes.length} Soru
              </Text>
            </View>
            <Text style={[styles.quickSecondaryTitle, { color: colors.text }]}>
              Yanlışlarımı Erit
            </Text>
            <Text
              style={[styles.quickSecondarySub, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {mistakes.length > 0
                ? 'Hatalarını çözerek eksiklerini kapat'
                : 'Bekleyen yanlış sorunuz yok'}
            </Text>
          </Pressable>
        </View>

        {quotaSummary.blocked || quotaSummary.limited ? (
          <Pressable
            onPress={() => stackNav.navigate('MembershipPaywall')}
            style={[
              styles.quotaStrip,
              {
                backgroundColor: quotaSummary.blocked ? colors.warningSoft : colors.primarySoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name={quotaSummary.blocked ? 'lock-closed' : 'gift-outline'}
              size={15}
              color={quotaSummary.blocked ? colors.warning : colors.primary}
            />
            <Text
              style={[
                styles.quotaStripText,
                { color: quotaSummary.blocked ? colors.warning : colors.primary },
              ]}
            >
              {quotaSummary.text}
            </Text>
            <Text style={[styles.quotaStripCta, { color: colors.primary }]}>
              {quotaSummary.blocked ? 'Seçenekler' : 'VIP'}
            </Text>
          </Pressable>
        ) : null}

        {/* Courses Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Dersler</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MembershipPill />
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              Konu seçip test çözün
            </Text>
          </View>
        </View>

        {courseStats.map(item => (
          <CourseCard
            key={item.course.id}
            course={item.course}
            remainingTests={membership.remainingFor(item.course.id)}
            quotaBlocked={!membership.isVip && membership.quota.enforced && membership.remainingFor(item.course.id) <= 0}
            totalQuestions={item.totalQuestions}
            activeTopicsCount={item.activeTopicsCount}
            solvedTestsCount={item.solvedTestsCount}
            accuracyPercent={item.accuracyPercent}
            onPress={() =>
              stackNav.navigate('CourseTopics', { courseId: item.course.id })
            }
          />
        ))}

        {/* Clean Hap Bilgi Spotlight */}
        {currentTip.length > 0 && (
          <View
            style={[
              styles.tipCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.tipHeader}>
              <View style={styles.tipTitleWrap}>
                <Ionicons name="bulb-outline" size={17} color={colors.warning} />
                <Text style={[styles.tipHeaderLabel, { color: colors.text }]}>
                  Hap Bilgi
                </Text>
                <Text style={[styles.tipCounter, { color: colors.textMuted }]}>
                  {(tipIndex % dailyTips.length) + 1}/{dailyTips.length}
                </Text>
              </View>

              <Pressable
                onPress={() => tabNav.navigate('TipsTab')}
                hitSlop={8}
                style={styles.tipAllBtn}
              >
                <Text style={[styles.tipAllText, { color: colors.primary }]}>
                  Tümünü Gör
                </Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </Pressable>
            </View>

            <Text style={[styles.tipBody, { color: colors.text }]}>
              {currentTip}
            </Text>

            <View style={styles.tipActions}>
              <Pressable
                onPress={() => toggleTipSaved(currentTip)}
                style={[
                  styles.tipMiniBtn,
                  {
                    backgroundColor: isCurrentTipSaved
                      ? colors.warningSoft
                      : colors.surfaceSecondary,
                  },
                ]}
              >
                <Ionicons
                  name={isCurrentTipSaved ? 'bookmark' : 'bookmark-outline'}
                  size={15}
                  color={isCurrentTipSaved ? colors.warning : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tipMiniBtnText,
                    {
                      color: isCurrentTipSaved
                        ? colors.warning
                        : colors.textSecondary,
                    },
                  ]}
                >
                  {isCurrentTipSaved ? 'Kaydedildi' : 'Kaydet'}
                </Text>
              </Pressable>

              <View style={styles.tipNavPair}>
                <Pressable
                  onPress={() =>
                    setTipIndex(prev =>
                      prev === 0 ? dailyTips.length - 1 : prev - 1
                    )
                  }
                  style={[
                    styles.tipArrowBtn,
                    { backgroundColor: colors.surfaceSecondary },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() =>
                    setTipIndex(prev => (prev + 1) % Math.max(1, dailyTips.length))
                  }
                  style={[
                    styles.tipArrowBtn,
                    { backgroundColor: colors.surfaceSecondary },
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Goal & Exam Target Settings Modal */}
      <Modal
        visible={goalModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setGoalModalOpen(false)}
          />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Çalışma Hedefi & Sınav
              </Text>
              <Pressable onPress={() => setGoalModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>
              Günlük Soru Hedefi
            </Text>
            <View style={styles.goalChipsRow}>
              {GOAL_OPTIONS.map(opt => {
                const active = settings.dailyGoal === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => updateSettings({ dailyGoal: opt })}
                    style={[
                      styles.goalChip,
                      {
                        backgroundColor: active
                          ? colors.primary
                          : colors.surfaceSecondary,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.goalChipText,
                        { color: active ? '#FFFFFF' : colors.text },
                      ]}
                    >
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text
              style={[
                styles.modalSectionLabel,
                { color: colors.textSecondary, marginTop: 18 },
              ]}
            >
              Hedeflenen Sınav
            </Text>
            <View style={styles.examList}>
              {EXAM_PRESETS.map(preset => {
                const active = settings.examPresetId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => updateSettings({ examPresetId: preset.id })}
                    style={[
                      styles.examOption,
                      {
                        backgroundColor: active
                          ? colors.primarySoft
                          : colors.surfaceSecondary,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.examOptionLabel,
                        { color: active ? colors.primary : colors.text },
                      ]}
                    >
                      {preset.label}
                    </Text>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={active ? colors.primary : colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                setGoalModalOpen(false);
                stackNav.navigate(admin.unlocked ? 'AdminPanel' : 'AdminLogin');
              }}
              style={[
                styles.adminEntryBtn,
                { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
              <Text style={[styles.adminEntryText, { color: colors.text }]}>
                Yönetim Paneli
              </Text>
              <Text style={[styles.adminEntryHint, { color: colors.textMuted }]}>
                {admin.unlocked ? 'kilit açık' : 'PIN ile korumalı'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setGoalModalOpen(false)}
              style={[styles.modalDoneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.modalDoneText}>Tamam</Text>
            </Pressable>
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
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appSub: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  quotaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 14,
  },
  quotaStripText: { flex: 1, fontSize: 11.5, fontWeight: '800', lineHeight: 16 },
  quotaStripCta: { fontSize: 11.5, fontWeight: '900', textDecorationLine: 'underline' },
  adminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  adminBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  goalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  goalTitleGroup: {
    flex: 1,
  },
  goalLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 2,
  },
  goalNumbersRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  goalBig: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  goalTarget: {
    fontSize: 14,
    fontWeight: '600',
  },
  countdownBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'flex-end',
    maxWidth: '52%',
  },
  countdownDays: {
    fontSize: 15,
    fontWeight: '800',
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  goalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalStatText: {
    fontSize: 12,
    fontWeight: '500',
  },
  editGoalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editGoalText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  quickCard: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    minHeight: 116,
    justifyContent: 'space-between',
  },
  quickIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickIconWhiteBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIconSoft: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPillLight: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  quickCountBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  quickPrimaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  quickPrimarySub: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  quickSecondaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  quickSecondarySub: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  tipCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 10,
    gap: 12,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tipTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipHeaderLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  tipCounter: {
    fontSize: 12,
    fontWeight: '600',
  },
  tipAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tipAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tipBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  tipActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tipMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tipMiniBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tipNavPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  adminEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  adminEntryText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
  },
  adminEntryHint: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  goalChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  goalChipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  examList: {
    gap: 8,
  },
  examOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  examOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalDoneBtn: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
