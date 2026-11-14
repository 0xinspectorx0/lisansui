import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COURSES, useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { Question, RootStackParamList, TopicMeta } from '../lib/types';
import {
  buildCourseMixedQuestions,
  fetchTopicQuestions,
} from '../lib/kpssApi';
import { prepareQuizQuestions } from '../lib/textUtils';
import { TopicTestSheet } from '../components/TopicTestSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'CourseTopics'>;

export const CourseTopicsScreen: React.FC<Props> = ({ route, navigation }) => {
  const rawCourseId = route.params?.courseId;
  const courseId = rawCourseId && rawCourseId in COURSES ? rawCourseId : 'tarih';
  const course = COURSES[courseId];
  const { colors } = useAppTheme();
  const admin = useAdmin();
  const membership = useMembership();
  const questionsPerTest = admin.settings.quizDefaults.questionCount;
  const remainingTests = membership.remainingFor(courseId);
  const quotaBlocked = Number.isFinite(remainingTests) && remainingTests <= 0;
  const {
    catalog,
    results,
    studiedTopics,
    toggleTopicStudied,
    resetTopicResults,
    refreshCourse,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ready' | 'all'>('ready');
  const [refreshing, setRefreshing] = useState(false);
  const [startingMixed, setStartingMixed] = useState(false);

  // Test Selection Sheet state
  const [selectedTopic, setSelectedTopic] = useState<TopicMeta | null>(null);
  const [sheetQuestions, setSheetQuestions] = useState<Question[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);

  const topics = useMemo(() => catalog[courseId] || [], [catalog, courseId]);
  const readyCount = useMemo(
    () => topics.filter(t => t.questionCount > 0).length,
    [topics]
  );

  const accent = colors.isDark ? course.accentDark : course.accentLight;
  const softBg = colors.isDark ? course.softBgDark : course.softBgLight;

  const topicStatsMap = useMemo(() => {
    const map: Record<
      string,
      { solvedTests: number; totalTests: number; accuracy: number | null }
    > = {};
    const allResults = Object.values(results);

    topics.forEach(t => {
      const tResults = allResults.filter(
        r => r.topicDocId === t.docId || r.key.startsWith(`${t.docId}_test_`)
      );
      const totalTests =
        t.questionCount > 0 ? Math.ceil(t.questionCount / questionsPerTest) : 0;
      const correctSum = tResults.reduce((s, r) => s + r.correct, 0);
      const answeredSum = tResults.reduce((s, r) => s + r.correct + r.wrong, 0);
      map[t.docId] = {
        solvedTests: Math.min(tResults.length, Math.max(totalTests, tResults.length)),
        totalTests,
        accuracy: answeredSum > 0 ? Math.round((correctSum / answeredSum) * 100) : null,
      };
    });
    return map;
  }, [topics, results, questionsPerTest]);

  const weakestTopic = useMemo(() => {
    let worst: { topic: TopicMeta; accuracy: number } | null = null;
    for (const t of topics) {
      if (t.questionCount === 0) continue;
      const st = topicStatsMap[t.docId];
      if (st && st.accuracy !== null && st.accuracy < 65) {
        if (!worst || st.accuracy < worst.accuracy) {
          worst = { topic: t, accuracy: st.accuracy };
        }
      }
    }
    return worst;
  }, [topics, topicStatsMap]);

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return topics.filter(t => {
      if (filterMode === 'ready' && t.questionCount === 0) return false;
      if (q && !t.name.toLocaleLowerCase('tr-TR').includes(q)) return false;
      return true;
    });
  }, [topics, filterMode, search]);

  const handleOpenTopic = useCallback(
    async (topic: TopicMeta) => {
      setSelectedTopic(topic);
      setSheetLoading(true);
      setSheetQuestions([]);
      try {
        const qs = await fetchTopicQuestions(courseId, topic.docId, topic.name);
        setSheetQuestions(qs);
      } finally {
        setSheetLoading(false);
      }
    },
    [courseId]
  );

  const handleStartCourseMixed = async () => {
    if (startingMixed) return;
    if (!membership.canStart(courseId, topics)) {
      navigation.navigate('MembershipPaywall');
      return;
    }
    setStartingMixed(true);
    try {
      const qs = await buildCourseMixedQuestions(
        courseId,
        topics,
        admin.settings.quizDefaults.questionCount
      );
      const prepared = prepareQuizQuestions(
        qs,
        admin.settings.quizDefaults.shuffleQuestions,
        admin.settings.quizDefaults.shuffleOptions
      );
      if (prepared.length > 0) {
        navigation.navigate('Quiz', {
          session: {
            title: `${course.title} • Genel Tarama`,
            courseId,
            mode: 'mixed',
            questions: prepared,
            timedMinutes: null,
          },
        });
      }
    } finally {
      setStartingMixed(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCourse(courseId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'))}
          style={[
            styles.backBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            {course.title}
          </Text>
          <Text style={[styles.screenSub, { color: colors.textSecondary }]}>
            {readyCount} test konusu hazır
          </Text>
        </View>

        <Pressable
          onPress={handleStartCourseMixed}
          disabled={startingMixed}
          style={[
            styles.mixedBtn,
            { backgroundColor: softBg, borderColor: accent },
          ]}
        >
          {startingMixed ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name="shuffle" size={16} color={accent} />
          )}
          <Text style={[styles.mixedBtnText, { color: accent }]}>Karma 20</Text>
        </Pressable>
      </View>

      {Number.isFinite(remainingTests) && (
        <Pressable
          onPress={() => navigation.navigate('MembershipPaywall')}
          style={[
            styles.quotaStrip,
            {
              backgroundColor: quotaBlocked ? colors.warningSoft : colors.primarySoft,
              borderColor: colors.border,
            },
          ]}
        >
          <Ionicons
            name={quotaBlocked ? 'lock-closed' : 'gift-outline'}
            size={15}
            color={quotaBlocked ? colors.warning : colors.primary}
          />
          <Text
            style={[
              styles.quotaStripText,
              { color: quotaBlocked ? colors.warning : colors.primary },
            ]}
          >
            {quotaBlocked
              ? `${course.title} dersinde ücretsiz test hakkın bitti — tekrar çözebilirsin`
              : `Ücretsiz hak: ${course.title} dersinde ${remainingTests} test`}
          </Text>
          <Text style={[styles.quotaStripCta, { color: colors.primary }]}>
            {quotaBlocked ? 'Seçenekler' : 'VIP'}
          </Text>
        </Pressable>
      )}

      {/* Search + Mode Filter */}
      <View style={styles.controlsArea}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Konu ara..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {topics.length > readyCount && (
          <View
            style={[
              styles.segmented,
              { backgroundColor: colors.surfaceSecondary },
            ]}
          >
            <Pressable
              onPress={() => setFilterMode('ready')}
              style={[
                styles.segmentItem,
                filterMode === 'ready' && { backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color:
                      filterMode === 'ready' ? colors.text : colors.textSecondary,
                  },
                ]}
              >
                Hazır Konular ({readyCount})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterMode('all')}
              style={[
                styles.segmentItem,
                filterMode === 'all' && { backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color:
                      filterMode === 'all' ? colors.text : colors.textSecondary,
                  },
                ]}
              >
                Tüm Müfredat ({topics.length})
              </Text>
            </Pressable>
          </View>
        )}

        {weakestTopic && !search && (
          <Pressable
            onPress={() => handleOpenTopic(weakestTopic.topic)}
            style={[
              styles.weakBanner,
              {
                backgroundColor: colors.warningSoft,
                borderColor: colors.warning,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.warning} />
            <View style={styles.weakTextWrap}>
              <Text style={[styles.weakTitle, { color: colors.warning }]}>
                Öncelikli Tekrar Önerisi (%{weakestTopic.accuracy} Başarı)
              </Text>
              <Text
                style={[styles.weakName, { color: colors.text }]}
                numberOfLines={1}
              >
                {weakestTopic.topic.name}
              </Text>
            </View>
            <Text style={[styles.weakCta, { color: colors.warning }]}>Çöz →</Text>
          </Pressable>
        )}
      </View>

      {/* Topics FlatList */}
      <FlatList
        data={filteredTopics}
        keyExtractor={item => item.docId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={34} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Eşleşen konu bulunamadı
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Arama terimini değiştirebilir veya tüm müfredata geçebilirsiniz.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const stat = topicStatsMap[item.docId];
          const isStudied = !!studiedTopics[item.docId];
          const hasQuestions = item.questionCount > 0;
          const progressRatio =
            stat && stat.totalTests > 0
              ? Math.min(1, stat.solvedTests / stat.totalTests)
              : 0;

          return (
            <Pressable
              onPress={() =>
                hasQuestions || !admin.featureOn('topicProgress')
                  ? handleOpenTopic(item)
                  : toggleTopicStudied(item.docId)
              }
              style={({ pressed }) => [
                styles.topicCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <View style={styles.topicMainRow}>
                <Pressable
                  onPress={() => toggleTopicStudied(item.docId)}
                  hitSlop={10}
                  style={[styles.checkWrap, !admin.featureOn('topicProgress') && { display: 'none' }]}
                >
                  <Ionicons
                    name={isStudied ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isStudied ? colors.success : colors.textMuted}
                  />
                </Pressable>

                <View style={styles.topicInfo}>
                  <Text
                    style={[
                      styles.topicName,
                      {
                        color: colors.text,
                        opacity: isStudied && !hasQuestions ? 0.65 : 1,
                      },
                    ]}
                  >
                    {item.name}
                  </Text>

                  <View style={styles.topicMetaRow}>
                    {hasQuestions ? (
                      <>
                        <Text
                          style={[styles.topicMeta, { color: colors.textSecondary }]}
                        >
                          {item.questionCount} soru • {stat?.totalTests || 1} test
                        </Text>
                        {stat && stat.solvedTests > 0 && (
                          <Text
                            style={[styles.topicSolvedBadge, { color: accent }]}
                          >
                            • {stat.solvedTests}/{stat.totalTests} çözüldü
                            {stat.accuracy !== null ? ` (%${stat.accuracy})` : ''}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={[styles.topicMeta, { color: colors.textMuted }]}>
                        {isStudied
                          ? 'Konu çalışıldı olarak işaretlendi'
                          : 'Müfredat takibi — işaretlemek için dokunun'}
                      </Text>
                    )}
                  </View>

                  {hasQuestions && stat && stat.solvedTests > 0 && (
                    <View
                      style={[
                        styles.miniTrack,
                        { backgroundColor: colors.surfaceSecondary },
                      ]}
                    >
                      <View
                        style={[
                          styles.miniFill,
                          {
                            width: `${Math.round(progressRatio * 100)}%`,
                            backgroundColor: accent,
                          },
                        ]}
                      />
                    </View>
                  )}
                </View>

                {hasQuestions && (
                  <View
                    style={[
                      styles.solvePill,
                      { backgroundColor: colors.surfaceSecondary },
                    ]}
                  >
                    <Text style={[styles.solvePillText, { color: colors.text }]}>
                      Testler
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={colors.textSecondary}
                    />
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />

      <TopicTestSheet
        questionsPerTest={questionsPerTest}
        remainingTests={remainingTests}
        memberId={membership.member?.id ?? 'device:guest'}
        quotaCourseLabel={course.title}
        onRequestMembership={() => navigation.navigate('MembershipPaywall')}
        timedMinutesPerTest={
          admin.settings.quizDefaults.timedMinutes > 0
            ? admin.settings.quizDefaults.timedMinutes
            : null
        }
        visible={!!selectedTopic}
        topic={selectedTopic}
        questions={sheetQuestions}
        loading={sheetLoading}
        results={results}
        onClose={() => setSelectedTopic(null)}
        onResetTopic={resetTopicResults}
        onSelectTest={({
          questions,
          testIndex,
          totalTests,
          resultKey,
          title,
          timedMinutes,
        }) => {
          const currentTopic = selectedTopic;
          setSelectedTopic(null);
          const prepared = prepareQuizQuestions(
            questions,
            admin.settings.quizDefaults.shuffleQuestions,
            admin.settings.quizDefaults.shuffleOptions
          );
          navigation.navigate('Quiz', {
            session: {
              title,
              courseId,
              topicDocId: currentTopic?.docId,
              testIndex,
              totalTestsInTopic: totalTests,
              resultKey,
              mode: 'normal',
              questions: prepared,
              timedMinutes,
            },
          });
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  mixedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  mixedBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  quotaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
  },
  quotaStripText: { flex: 1, fontSize: 11.5, fontWeight: '800', lineHeight: 16 },
  quotaStripCta: { fontSize: 11.5, fontWeight: '900', textDecorationLine: 'underline' },
  controlsArea: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  weakTextWrap: {
    flex: 1,
  },
  weakTitle: {
    fontSize: 11,
    fontWeight: '800',
  },
  weakName: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  weakCta: {
    fontSize: 12,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
  },
  topicCard: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 13,
    marginBottom: 9,
  },
  topicMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkWrap: {
    padding: 2,
  },
  topicInfo: {
    flex: 1,
    gap: 3,
  },
  topicName: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  topicMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  topicMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  topicSolvedBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  miniTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
  },
  miniFill: {
    height: '100%',
    borderRadius: 999,
  },
  solvePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  solvePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBox: {
    paddingVertical: 56,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
