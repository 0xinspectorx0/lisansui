import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { RootStackParamList } from '../lib/types';
import { formatDuration } from '../lib/textUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'Quiz'>;

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const QuizScreen: React.FC<Props> = ({ route, navigation }) => {
  const { session } = route.params;
  const { colors } = useAppTheme();
  const admin = useAdmin();
  const {
    isFavorite,
    toggleFavorite,
    mistakes,
    finalizeQuizSession,
  } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [elapsedSec, setElapsedSec] = useState(0);
  const [remainingSec, setRemainingSec] = useState<number | null>(
    session.timedMinutes ? session.timedMinutes * 60 : null
  );
  const [exitModalVisible, setExitModalVisible] = useState(false);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const elapsedRef = useRef(elapsedSec);
  elapsedRef.current = elapsedSec;
  const finishedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const totalQuestions = session.questions.length;
  const currentQuestion = session.questions[currentIndex];

  const finishQuiz = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const resultPayload = finalizeQuizSession(
      session,
      answersRef.current,
      elapsedRef.current
    );
    navigation.replace('QuizResult', { result: resultPayload });
  }, [finalizeQuizSession, navigation, session]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(prev => prev + 1);
      if (session.timedMinutes) {
        setRemainingSec(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timer);
            setTimeout(() => finishQuiz(), 0);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [finishQuiz, session.timedMinutes]);

  const selectedOption = answers[currentIndex];
  const isAnswered = selectedOption !== undefined;
  const fav = currentQuestion ? isFavorite(currentQuestion.id) : false;

  const wasPreviousMistake = useMemo(() => {
    if (!currentQuestion || session.mode === 'mistake') return false;
    return mistakes.some(m => String(m.id) === String(currentQuestion.id));
  }, [currentQuestion, mistakes, session.mode]);

  const handleSelectOption = (optionIdx: number) => {
    if (isAnswered || !currentQuestion) return;
    const isCorrect = optionIdx === currentQuestion.answer;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        isCorrect
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
    }
    setAnswers(prev => ({ ...prev, [currentIndex]: optionIdx }));
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 120);
  };

  const goToQuestion = (idx: number) => {
    if (idx < 0 || idx >= totalQuestions) return;
    setCurrentIndex(idx);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleClosePress = () => {
    if (Object.keys(answers).length === 0) {
      navigation.goBack();
      return;
    }
    setExitModalVisible(true);
  };

  if (!currentQuestion) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.centerFallback}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            Soru bulunamadı.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
          >
            <Text style={styles.primaryBtnText}>Geri Dön</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const progressPct = Math.round(((currentIndex + 1) / totalQuestions) * 100);

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Clean Top Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleClosePress}
          style={[styles.iconCircle, { backgroundColor: colors.surfaceSecondary }]}
          hitSlop={8}
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.topCenter}>
          <Text style={[styles.quizTitle, { color: colors.text }]} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={[styles.quizProgressLabel, { color: colors.textSecondary }]}>
            Soru {currentIndex + 1} / {totalQuestions} • {answeredCount} işaretlendi
          </Text>
        </View>

        <View style={styles.topRight}>
          <View
            style={[
              styles.timerBadge,
              {
                backgroundColor:
                  remainingSec !== null && remainingSec < 120
                    ? colors.dangerSoft
                    : colors.surfaceSecondary,
              },
            ]}
          >
            <Ionicons
              name="time-outline"
              size={14}
              color={
                remainingSec !== null && remainingSec < 120
                  ? colors.danger
                  : colors.textSecondary
              }
            />
            <Text
              style={[
                styles.timerText,
                {
                  color:
                    remainingSec !== null && remainingSec < 120
                      ? colors.danger
                      : colors.text,
                },
              ]}
            >
              {remainingSec !== null
                ? formatDuration(remainingSec)
                : formatDuration(elapsedSec)}
            </Text>
          </View>

          {admin.featureOn('favorites') && (
          <Pressable
            onPress={() => toggleFavorite(currentQuestion)}
            style={[
              styles.iconCircle,
              {
                backgroundColor: fav
                  ? colors.warningSoft
                  : colors.surfaceSecondary,
              },
            ]}
            hitSlop={8}
          >
            <Ionicons
              name={fav ? 'star' : 'star-outline'}
              size={18}
              color={fav ? colors.warning : colors.textSecondary}
            />
          </Pressable>
          )}
        </View>
      </View>

      {/* Thin Progress Line */}
      <View style={[styles.progressLine, { backgroundColor: colors.surfaceSecondary }]}>
        <View
          style={[
            styles.progressLineFill,
            { width: `${progressPct}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>

      {/* Compact Question Navigator Strip */}
      <View style={styles.navStripWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navStripContent}
        >
          {session.questions.map((q, idx) => {
            const ans = answers[idx];
            const isCurrent = idx === currentIndex;
            const hasAns = ans !== undefined;
            const right = hasAns && ans === q.answer;

            let bg = colors.surfaceSecondary;
            let txtColor = colors.textSecondary;
            let border = colors.border;

            if (isCurrent) {
              border = colors.primary;
              txtColor = colors.primary;
              bg = colors.primarySoft;
            } else if (hasAns) {
              bg = right ? colors.successSoft : colors.dangerSoft;
              border = right ? colors.success : colors.danger;
              txtColor = right ? colors.success : colors.danger;
            }

            return (
              <Pressable
                key={`${q.id}_${idx}`}
                onPress={() => goToQuestion(idx)}
                style={[
                  styles.qDot,
                  {
                    backgroundColor: bg,
                    borderColor: border,
                  },
                ]}
              >
                <Text style={[styles.qDotText, { color: txtColor }]}>
                  {idx + 1}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Question & Options Scroll Area */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.questionCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {wasPreviousMistake && (
            <View
              style={[
                styles.prevMistakeBadge,
                { backgroundColor: colors.dangerSoft },
              ]}
            >
              <Ionicons name="refresh" size={12} color={colors.danger} />
              <Text style={[styles.prevMistakeText, { color: colors.danger }]}>
                Daha önce yanlış yapıldı
              </Text>
            </View>
          )}

          <Text style={[styles.questionText, { color: colors.text }]}>
            {currentQuestion.question}
          </Text>
        </View>

        <View style={styles.optionsList}>
          {currentQuestion.options.map((opt, idx) => {
            const isCorrectOption = idx === currentQuestion.answer;
            const isChosenOption = idx === selectedOption;

            let cardBg = colors.surface;
            let cardBorder = colors.border;
            let badgeBg = colors.surfaceSecondary;
            let badgeText = colors.textSecondary;
            let textCol = colors.text;

            if (isAnswered) {
              if (isCorrectOption) {
                cardBg = colors.successSoft;
                cardBorder = colors.success;
                badgeBg = colors.success;
                badgeText = '#FFFFFF';
              } else if (isChosenOption) {
                cardBg = colors.dangerSoft;
                cardBorder = colors.danger;
                badgeBg = colors.danger;
                badgeText = '#FFFFFF';
              } else {
                textCol = colors.textSecondary;
              }
            }

            return (
              <Pressable
                key={idx}
                disabled={isAnswered}
                onPress={() => handleSelectOption(idx)}
                style={({ pressed }) => [
                  styles.optionCard,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                    opacity: !isAnswered && pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View style={[styles.letterCircle, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.letterText, { color: badgeText }]}>
                    {OPTION_LETTERS[idx] || String(idx + 1)}
                  </Text>
                </View>

                <Text style={[styles.optionText, { color: textCol }]}>{opt}</Text>

                {isAnswered && isCorrectOption && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.success}
                  />
                )}
                {isAnswered && isChosenOption && !isCorrectOption && (
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={colors.danger}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Instant Explanation Box */}
        {isAnswered && (
          <View
            style={[
              styles.explanationCard,
              {
                backgroundColor: colors.surface,
                borderColor:
                  selectedOption === currentQuestion.answer
                    ? colors.success
                    : colors.danger,
              },
            ]}
          >
            <View style={styles.explanationHeader}>
              <Ionicons
                name={
                  selectedOption === currentQuestion.answer
                    ? 'checkmark-circle'
                    : 'information-circle'
                }
                size={18}
                color={
                  selectedOption === currentQuestion.answer
                    ? colors.success
                    : colors.danger
                }
              />
              <Text
                style={[
                  styles.explanationTitle,
                  {
                    color:
                      selectedOption === currentQuestion.answer
                        ? colors.success
                        : colors.danger,
                  },
                ]}
              >
                {selectedOption === currentQuestion.answer
                  ? 'Doğru Cevap!'
                  : `Doğru Cevap: ${OPTION_LETTERS[currentQuestion.answer]} Şıkkı`}
              </Text>
            </View>

            {currentQuestion.explanation ? (
              <Text
                style={[styles.explanationBody, { color: colors.textSecondary }]}
              >
                {currentQuestion.explanation}
              </Text>
            ) : (
              <Text
                style={[styles.explanationBody, { color: colors.textSecondary }]}
              >
                Bu sorunun doğru yanıtı{' '}
                {OPTION_LETTERS[currentQuestion.answer]} seçeneğidir.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Ergonomic Bottom Bar */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => goToQuestion(currentIndex - 1)}
          disabled={currentIndex === 0}
          style={[
            styles.prevBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              opacity: currentIndex === 0 ? 0.4 : 1,
            },
          ]}
        >
          <Ionicons name="arrow-back" size={18} color={colors.text} />
          <Text style={[styles.prevBtnText, { color: colors.text }]}>Önceki</Text>
        </Pressable>

        {currentIndex < totalQuestions - 1 ? (
          <Pressable
            onPress={() => goToQuestion(currentIndex + 1)}
            style={[
              styles.nextBtn,
              {
                backgroundColor: isAnswered
                  ? colors.primary
                  : colors.surfaceSecondary,
              },
            ]}
          >
            <Text
              style={[
                styles.nextBtnText,
                { color: isAnswered ? '#FFFFFF' : colors.text },
              ]}
            >
              {isAnswered ? 'Sonraki Soru' : 'Boş Geç'}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={isAnswered ? '#FFFFFF' : colors.text}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={finishQuiz}
            style={[styles.nextBtn, { backgroundColor: colors.success }]}
          >
            <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
            <Text style={[styles.nextBtnText, { color: '#FFFFFF' }]}>
              Testi Bitir
            </Text>
          </Pressable>
        )}
      </View>

      {/* Clean Exit / Finish Early Modal */}
      <Modal
        visible={exitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExitModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Testten Çıkılsın mı?
            </Text>
            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Şu ana kadar {answeredCount} soruyu işaretlediniz. İsterseniz testi
              şimdi bitirip sonucunuzu kaydedebilirsiniz.
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setExitModalVisible(false);
                  finishQuiz();
                }}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.primaryBtnText}>Testi Bitir ve Sonucu Gör</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setExitModalVisible(false);
                  navigation.goBack();
                }}
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: colors.dangerSoft,
                    borderColor: colors.danger,
                  },
                ]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>
                  Kaydetmeden Çık
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setExitModalVisible(false)}
                style={styles.cancelTap}
              >
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
                  Çözmeye Devam Et
                </Text>
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
  centerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  quizProgressLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressLine: {
    height: 3,
    width: '100%',
  },
  progressLineFill: {
    height: '100%',
  },
  navStripWrap: {
    paddingVertical: 8,
  },
  navStripContent: {
    paddingHorizontal: 14,
    gap: 6,
  },
  qDot: {
    minWidth: 30,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qDotText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },
  questionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  prevMistakeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  prevMistakeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  questionText: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '600',
  },
  optionsList: {
    gap: 9,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1.5,
    paddingHorizontal: 13,
    paddingVertical: 13,
    gap: 12,
  },
  letterCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontSize: 13,
    fontWeight: '800',
  },
  optionText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '500',
  },
  explanationCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    gap: 6,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  explanationBody: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  prevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 46,
    borderRadius: 13,
  },
  prevBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 13,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '800',
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
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  modalActions: {
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 13,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cancelTap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
