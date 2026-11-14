import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { RootStackParamList } from '../lib/types';
import { fetchTopicQuestions } from '../lib/kpssApi';
import {
  formatDuration,
  formatNet,
  prepareQuizQuestions,
} from '../lib/textUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'QuizResult'>;

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const QuizResultScreen: React.FC<Props> = ({ route, navigation }) => {
  const result = route.params?.result || {
    session: {
      title: 'Test Sonucu',
      courseId: 'genel' as const,
      mode: 'normal' as const,
      questions: [],
    },
    answers: {},
    correct: 0,
    wrong: 0,
    blank: 0,
    net: 0,
    durationSec: 0,
    clearedMistakeCount: 0,
  };
  const { session, answers, correct, wrong, blank, net, durationSec, clearedMistakeCount } =
    result;
  const { colors } = useAppTheme();
  const { isFavorite, toggleFavorite } = useApp();

  const [loadingNext, setLoadingNext] = useState(false);

  const total = session.questions.length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  const wrongOrBlankItems = useMemo(() => {
    return session.questions
      .map((q, idx) => ({
        question: q,
        index: idx,
        chosen: answers[idx],
      }))
      .filter(item => item.chosen !== item.question.answer);
  }, [session.questions, answers]);

  const wrongOnlyQuestions = useMemo(() => {
    return session.questions.filter(
      (q, idx) => answers[idx] !== undefined && answers[idx] !== q.answer
    );
  }, [session.questions, answers]);

  const hasNextSequentialTest =
    session.courseId !== 'genel' &&
    !!session.topicDocId &&
    session.testIndex !== undefined &&
    session.totalTestsInTopic !== undefined &&
    session.testIndex + 1 < session.totalTestsInTopic;

  const handleStartNextTest = async () => {
    if (
      !hasNextSequentialTest ||
      session.courseId === 'genel' ||
      !session.topicDocId ||
      session.testIndex === undefined
    ) {
      return;
    }
    setLoadingNext(true);
    try {
      const nextIdx = session.testIndex + 1;
      const allQs = await fetchTopicQuestions(
        session.courseId,
        session.topicDocId
      );
      const slice = allQs.slice(nextIdx * 20, (nextIdx + 1) * 20);
      if (slice.length > 0) {
        const baseTitle = session.title.replace(/\s*•\s*Test\s*\d+$/i, '');
        const prepared = prepareQuizQuestions(slice, true, true);
        navigation.replace('Quiz', {
          session: {
            title: `${baseTitle} • Test ${nextIdx + 1}`,
            courseId: session.courseId,
            topicDocId: session.topicDocId,
            testIndex: nextIdx,
            totalTestsInTopic: session.totalTestsInTopic,
            resultKey: `${session.topicDocId}_test_${nextIdx}`,
            mode: 'normal',
            questions: prepared,
            timedMinutes: session.timedMinutes ? prepared.length : null,
          },
        });
      }
    } finally {
      setLoadingNext(false);
    }
  };

  const handleRetryWrong = () => {
    if (wrongOnlyQuestions.length === 0) return;
    const prepared = prepareQuizQuestions(wrongOnlyQuestions, true, true);
    navigation.replace('Quiz', {
      session: {
        title: `${session.title} • Hata Telafisi`,
        courseId: session.courseId,
        mode: 'mistake',
        questions: prepared,
        timedMinutes: null,
        autoClearMistakes: true,
      },
    });
  };

  const feedbackMessage =
    accuracy >= 85
      ? 'Çok sağlam bir performans. Bu tempoyu koruyun!'
      : accuracy >= 65
      ? 'İyi seviyedesiniz. Yanlışların çözümlerine göz atıp pekiştirin.'
      : 'Eksik noktaları aşağıdaki çözümlerden inceleyerek hemen kapatabilirsiniz.';

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.kicker, { color: colors.primary }]}>
            TEST SONUCU
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {session.title}
          </Text>

          <View style={[styles.netCircleWrap, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.netValue, { color: colors.primary }]}>
              {formatNet(net)}
            </Text>
            <Text style={[styles.netLabel, { color: colors.primary }]}>
              KPSS NET
            </Text>
          </View>

          <Text style={[styles.feedback, { color: colors.textSecondary }]}>
            {feedbackMessage}
          </Text>

          {clearedMistakeCount > 0 && (
            <View
              style={[
                styles.clearedBanner,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <Ionicons
                name="checkmark-done-circle"
                size={18}
                color={colors.success}
              />
              <Text style={[styles.clearedText, { color: colors.success }]}>
                {clearedMistakeCount} soru doğru çözüldü ve yanlışlar listenizden temizlendi!
              </Text>
            </View>
          )}

          <View style={styles.metricsRow}>
            <View
              style={[
                styles.metricBox,
                { backgroundColor: colors.successSoft },
              ]}
            >
              <Text style={[styles.metricNum, { color: colors.success }]}>
                {correct}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.success }]}>
                DOĞRU
              </Text>
            </View>

            <View
              style={[
                styles.metricBox,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Text style={[styles.metricNum, { color: colors.danger }]}>
                {wrong}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.danger }]}>
                YANLIŞ
              </Text>
            </View>

            <View
              style={[
                styles.metricBox,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Text style={[styles.metricNum, { color: colors.textSecondary }]}>
                {blank}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                BOŞ
              </Text>
            </View>

            <View
              style={[
                styles.metricBox,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Text style={[styles.metricNum, { color: colors.text }]}>
                %{accuracy}
              </Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
                BAŞARI
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.timeStrip,
              { backgroundColor: colors.surfaceSecondary },
            ]}
          >
            <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>
              Tamamlanma Süresi
            </Text>
            <Text style={[styles.timeVal, { color: colors.text }]}>
              {formatDuration(durationSec)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsGroup}>
          {hasNextSequentialTest && (
            <Pressable
              onPress={handleStartNextTest}
              disabled={loadingNext}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              {loadingNext ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>
                    Sıradaki Teste Geç (Test {(session.testIndex || 0) + 2})
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          )}

          {wrongOnlyQuestions.length > 0 && (
            <Pressable
              onPress={handleRetryWrong}
              style={[
                styles.outlineBtn,
                {
                  backgroundColor: colors.dangerSoft,
                  borderColor: colors.danger,
                },
              ]}
            >
              <Ionicons name="refresh" size={18} color={colors.danger} />
              <Text style={[styles.outlineBtnText, { color: colors.danger }]}>
                Sadece Yanlışları Çöz ({wrongOnlyQuestions.length} Soru)
              </Text>
            </Pressable>
          )}

          <View style={styles.dualRow}>
            {session.courseId !== 'genel' && (
              <Pressable
                onPress={() =>
                  navigation.navigate('CourseTopics', {
                    courseId: session.courseId as any,
                  })
                }
                style={[
                  styles.dualBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.dualBtnText, { color: colors.text }]}>
                  Konulara Dön
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => navigation.navigate('MainTabs')}
              style={[
                styles.dualBtn,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[styles.dualBtnText, { color: colors.text }]}>
                Ana Sayfa
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Review Wrong & Blank Questions */}
        {wrongOrBlankItems.length > 0 && (
          <View style={styles.reviewSection}>
            <Text style={[styles.reviewHeading, { color: colors.text }]}>
              Yanlış ve Boş Soruların Çözümleri ({wrongOrBlankItems.length})
            </Text>

            {wrongOrBlankItems.map(({ question: q, index, chosen }) => {
              const fav = isFavorite(q.id);
              const isBlank = chosen === undefined;
              return (
                <View
                  key={`${q.id}_${index}`}
                  style={[
                    styles.reviewCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.reviewCardHeader}>
                    <View
                      style={[
                        styles.statusTag,
                        {
                          backgroundColor: isBlank
                            ? colors.surfaceSecondary
                            : colors.dangerSoft,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusTagText,
                          {
                            color: isBlank ? colors.textSecondary : colors.danger,
                          },
                        ]}
                      >
                        Soru {index + 1} • {isBlank ? 'Boş Bırakıldı' : 'Yanlış'}
                      </Text>
                    </View>

                    <Pressable onPress={() => toggleFavorite(q)} hitSlop={8}>
                      <Ionicons
                        name={fav ? 'star' : 'star-outline'}
                        size={18}
                        color={fav ? colors.warning : colors.textMuted}
                      />
                    </Pressable>
                  </View>

                  <Text style={[styles.reviewQuestion, { color: colors.text }]}>
                    {q.question}
                  </Text>

                  {!isBlank && chosen !== undefined && (
                    <Text style={[styles.yourChoice, { color: colors.danger }]}>
                      Senin cevabın: {OPTION_LETTERS[chosen]}) {q.options[chosen]}
                    </Text>
                  )}

                  <View
                    style={[
                      styles.correctAnswerBox,
                      { backgroundColor: colors.successSoft },
                    ]}
                  >
                    <Text
                      style={[styles.correctAnswerText, { color: colors.success }]}
                    >
                      Doğru Cevap: {OPTION_LETTERS[q.answer]}) {q.options[q.answer]}
                    </Text>
                  </View>

                  {!!q.explanation && (
                    <Text
                      style={[
                        styles.reviewExplanation,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {q.explanation}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 16,
  },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  netCircleWrap: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  netValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  netLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  feedback: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  clearedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
    width: '100%',
  },
  clearedText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
  metricNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  timeStrip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeVal: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  actionsGroup: {
    gap: 10,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 15,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 15,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  dualRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dualBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  reviewSection: {
    marginTop: 6,
    gap: 10,
  },
  reviewHeading: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
    gap: 9,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reviewQuestion: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '600',
  },
  yourChoice: {
    fontSize: 13,
    fontWeight: '600',
  },
  correctAnswerBox: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  correctAnswerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  reviewExplanation: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
});
