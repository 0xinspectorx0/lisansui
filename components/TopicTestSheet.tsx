import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Question, TestResult, TopicMeta } from '../lib/types';
import { useAppTheme } from '../lib/theme';
import { formatNet } from '../lib/textUtils';

const DEFAULT_QUESTIONS_PER_TEST = 20;

interface TopicTestSheetProps {
  visible: boolean;
  topic: TopicMeta | null;
  questions: Question[];
  loading: boolean;
  results: Record<string, TestResult>;
  onClose: () => void;
  onSelectTest: (params: {
    questions: Question[];
    testIndex?: number;
    totalTests: number;
    resultKey?: string;
    title: string;
    timedMinutes: number | null;
  }) => void;
  onResetTopic: (topicDocId: string) => void;
  /** Admin-tunable test size (defaults to 20 questions per test). */
  questionsPerTest?: number;
  /** Pre-arm the built-in exam timer with this many minutes per test. */
  timedMinutesPerTest?: number | null;
  /**
   * Remaining free tests for this course (Infinity = unlimited). When it reaches
   * 0 the sheet locks the not-yet-solved batches and offers the membership screen.
   */
  remainingTests?: number;
  /** Called when the student taps a locked batch. */
  onRequestMembership?: () => void;
  /** Friendly name shown in the quota banner. */
  quotaCourseLabel?: string;
  /**
   * Current member profile id. A batch counts as "already solved" only for the
   * member who solved it, so a second account on the same device gets its own
   * free test instead of inheriting (or being blocked by) someone else's history.
   */
  memberId?: string | null;
}

export const TopicTestSheet: React.FC<TopicTestSheetProps> = ({
  visible,
  topic,
  questions,
  loading,
  results,
  onClose,
  onSelectTest,
  onResetTopic,
  questionsPerTest = DEFAULT_QUESTIONS_PER_TEST,
  timedMinutesPerTest = null,
  remainingTests = Infinity,
  onRequestMembership,
  quotaCourseLabel,
  memberId,
}) => {
  const { colors } = useAppTheme();
  const [timedEnabled, setTimedEnabled] = useState(timedMinutesPerTest !== null);

  const batches = useMemo(() => {
    if (!questions.length) return [];
    const size = Math.max(5, questionsPerTest);
    const total = Math.ceil(questions.length / size);
    return Array.from({ length: total }, (_, index) => {
      const slice = questions.slice(index * size, (index + 1) * size);
      const resultKey = topic ? `${topic.docId}_test_${index}` : `test_${index}`;
      const stored = results[resultKey];
      const owner = memberId ?? 'device:guest';
      const savedResult =
        stored && (stored.memberId ?? 'device:guest') === owner ? stored : undefined;
      return {
        index,
        slice,
        resultKey,
        savedResult,
        // A test already solved never consumes quota again; only fresh batches do.
        locked: !savedResult && index >= remainingTests,
      };
    });
  }, [questions, results, topic, questionsPerTest, remainingTests, memberId]);

  const hasAnySavedResult = useMemo(
    () => batches.some(b => !!b.savedResult),
    [batches]
  );

  if (!topic) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />

          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.kicker, { color: colors.primary }]}>
                TEST SEÇİMİ
              </Text>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {topic.name}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {loading
                  ? 'Sorular yükleniyor...'
                  : `${questions.length} soru • ${batches.length} test`}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View
            style={[
              styles.optionsBar,
              {
                backgroundColor: colors.surfaceSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.timerRow}>
              <Ionicons name="timer-outline" size={18} color={colors.primary} />
              <Text style={[styles.timerLabel, { color: colors.text }]}>
                Sınav Süresi Tut (Soru başı 1 dk)
              </Text>
            </View>
            <Switch
              value={timedEnabled}
              onValueChange={setTimedEnabled}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {Number.isFinite(remainingTests) && (
            <View
              style={[
                styles.quotaBanner,
                {
                  backgroundColor:
                    remainingTests > 0 ? colors.primarySoft : colors.warningSoft,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name={remainingTests > 0 ? 'gift-outline' : 'lock-closed'}
                size={15}
                color={remainingTests > 0 ? colors.primary : colors.warning}
              />
              <Text
                style={[
                  styles.quotaText,
                  { color: remainingTests > 0 ? colors.primary : colors.warning },
                ]}
              >
                {remainingTests > 0
                  ? `${quotaCourseLabel ? quotaCourseLabel + ' dersinde ' : ''}ücretsiz hakkın: ${remainingTests} test`
                  : `${quotaCourseLabel ? quotaCourseLabel + ' dersinde ' : ''}ücretsiz test hakkın bitti — çözdüğün testleri tekrar edebilirsin`}
              </Text>
              {remainingTests <= 0 && !!onRequestMembership && (
                <Pressable onPress={onRequestMembership} hitSlop={8}>
                  <Text style={[styles.quotaCta, { color: colors.primary }]}>VIP</Text>
                </Pressable>
              )}
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Canlı soru bankası getiriliyor...
              </Text>
            </View>
          ) : questions.length === 0 ? (
            <View style={styles.loadingBox}>
              <Ionicons
                name="document-text-outline"
                size={36}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Bu konuda henüz soru bulunmuyor
              </Text>
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Diğer hazır konulardan devam edebilirsiniz.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.quickActionWrap}>
                <Pressable
                  onPress={() => {
                    if (batches.every(b => b.locked)) {
                      onRequestMembership?.();
                      return;
                    }
                    const mixedSlice = [...questions]
                      .sort(() => Math.random() - 0.5)
                      .slice(0, Math.max(5, questionsPerTest));
                    onSelectTest({
                      questions: mixedSlice,
                      totalTests: batches.length,
                      title: `${topic.name} • Karışık`,
                      timedMinutes: timedEnabled
                        ? timedMinutesPerTest ?? mixedSlice.length
                        : null,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.randomBtn,
                    {
                      backgroundColor: colors.primarySoft,
                      borderColor: colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Ionicons name="shuffle" size={18} color={colors.primary} />
                  <Text style={[styles.randomBtnText, { color: colors.primary }]}>
                    Bu Konudan Karışık {Math.min(Math.max(5, questionsPerTest), questions.length)} Soru Çöz
                  </Text>
                </Pressable>

                {hasAnySavedResult && (
                  <Pressable
                    onPress={() => onResetTopic(topic.docId)}
                    style={[
                      styles.resetBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons name="refresh" size={16} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>

              <FlatList
                data={batches}
                keyExtractor={item => item.resultKey}
                numColumns={2}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const res = item.savedResult;
                  const pct =
                    res && res.total > 0
                      ? Math.round((res.correct / res.total) * 100)
                      : null;
                  const solvedGood = pct !== null && pct >= 70;
                  const solvedMid = pct !== null && pct >= 45 && pct < 70;

                  return (
                    <Pressable
                      onPress={() => {
                        if (item.locked) {
                          onRequestMembership?.();
                          return;
                        }
                        onSelectTest({
                          questions: item.slice,
                          testIndex: item.index,
                          totalTests: batches.length,
                          resultKey: item.resultKey,
                          title: `${topic.name} • Test ${item.index + 1}`,
                          timedMinutes: timedEnabled
                            ? timedMinutesPerTest ?? item.slice.length
                            : null,
                        });
                      }}
                      style={({ pressed }) => [
                        styles.testCard,
                        {
                          backgroundColor: res
                            ? solvedGood
                              ? colors.successSoft
                              : solvedMid
                              ? colors.warningSoft
                              : colors.dangerSoft
                            : colors.surfaceSecondary,
                          borderColor: res
                            ? solvedGood
                              ? colors.success
                              : solvedMid
                              ? colors.warning
                              : colors.danger
                            : item.locked
                            ? colors.warning
                            : colors.border,
                          opacity: item.locked ? 0.75 : pressed ? 0.86 : 1,
                        },
                      ]}
                    >
                      <View style={styles.testCardTop}>
                        <Text style={[styles.testTitle, { color: colors.text }]}>
                          Test {item.index + 1}
                        </Text>
                        {res ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color={
                              solvedGood
                                ? colors.success
                                : solvedMid
                                ? colors.warning
                                : colors.danger
                            }
                          />
                        ) : item.locked ? (
                          <Ionicons name="lock-closed" size={15} color={colors.warning} />
                        ) : (
                          <Ionicons
                            name="play-circle-outline"
                            size={16}
                            color={colors.textMuted}
                          />
                        )}
                      </View>

                      {res ? (
                        <Text
                          style={[
                            styles.testMeta,
                            {
                              color: solvedGood
                                ? colors.success
                                : solvedMid
                                ? colors.warning
                                : colors.danger,
                            },
                          ]}
                        >
                          {res.correct}D {res.wrong}Y • {formatNet(res.net)} Net
                        </Text>
                      ) : (
                        <Text
                          style={[
                            styles.testMeta,
                            { color: item.locked ? colors.warning : colors.textSecondary },
                          ]}
                        >
                          {item.locked ? 'Hak bitti' : `${item.slice.length} Soru`}
                        </Text>
                      )}
                    </Pressable>
                  );
                }}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    maxHeight: '84%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingBottom: 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  quotaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  quotaText: { flex: 1, fontSize: 11.5, fontWeight: '800', lineHeight: 16 },
  quotaCta: { fontSize: 11.5, fontWeight: '900', textDecorationLine: 'underline' },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  quickActionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
  },
  randomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  randomBtnText: {
    fontSize: 13,
    fontWeight: '700',
    // flex:1 kutusunda payını komşularla bölüşür: uzun etiket ("Bu Konudan
    // Karışık 20 Soru Çöz") kutudan taşınca yan butonun üstüne biniyordu —
    // shrink + merkez, satırın buton içinde sarmasını sağlar.
    textAlign: 'center',
    flexShrink: 1,
  },
  resetBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 13,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 16,
  },
  gridRow: {
    gap: 10,
    marginBottom: 10,
  },
  testCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 4,
  },
  testCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  testMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
});
