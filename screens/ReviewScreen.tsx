import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { COURSE_LIST, COURSES, useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { VipLockedScreen, useVipLocked } from '../components/admin/VipGate';
import { CourseId, RootStackParamList, SavedQuestion } from '../lib/types';
import { prepareQuizQuestions } from '../lib/textUtils';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const ReviewScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    mistakes,
    favorites,
    removeMistake,
    toggleFavorite,
    settings,
    updateSettings,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'mistakes' | 'favorites'>('mistakes');
  const [courseFilter, setCourseFilter] = useState<CourseId | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sourceList = activeTab === 'mistakes' ? mistakes : favorites;

  const filteredList = useMemo(() => {
    if (courseFilter === 'all') return sourceList;
    return sourceList.filter(item => item.courseId === courseFilter);
  }, [sourceList, courseFilter]);

  const courseCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sourceList.length };
    COURSE_LIST.forEach(c => {
      counts[c.id] = sourceList.filter(i => i.courseId === c.id).length;
    });
    return counts;
  }, [sourceList]);

  const handleStartReviewQuiz = () => {
    if (filteredList.length === 0) return;
    const slice = filteredList.slice(0, 25);
    const prepared = prepareQuizQuestions(slice, true, true);
    const courseLabel =
      courseFilter === 'all' ? 'Karma' : COURSES[courseFilter].title;
    navigation.navigate('Quiz', {
      session: {
        title:
          activeTab === 'mistakes'
            ? `Yanlışlarım • ${courseLabel}`
            : `Favorilerim • ${courseLabel}`,
        courseId: courseFilter === 'all' ? 'genel' : courseFilter,
        mode: activeTab === 'mistakes' ? 'mistake' : 'favorite',
        questions: prepared,
        timedMinutes: null,
        autoClearMistakes: settings.autoClearMistakes,
      },
    });
  };

  const renderItem = ({ item }: { item: SavedQuestion }) => {
    const isExpanded = expandedId === String(item.id);
    const courseMeta = COURSES[item.courseId] || COURSES.tarih;
    const accent = colors.isDark ? courseMeta.accentDark : courseMeta.accentLight;
    const softBg = colors.isDark ? courseMeta.softBgDark : courseMeta.softBgLight;

    return (
      <Pressable
        onPress={() => setExpandedId(isExpanded ? null : String(item.id))}
        style={[
          styles.qCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.qCardTop}>
          <View style={[styles.courseTag, { backgroundColor: softBg }]}>
            <Text style={[styles.courseTagText, { color: accent }]}>
              {courseMeta.shortTitle}
            </Text>
          </View>

          <View style={styles.qCardActions}>
            {activeTab === 'mistakes' ? (
              <Pressable
                onPress={() => removeMistake(String(item.id))}
                hitSlop={8}
                style={[
                  styles.removePill,
                  { backgroundColor: colors.surfaceSecondary },
                ]}
              >
                <Ionicons name="checkmark" size={14} color={colors.success} />
                <Text
                  style={[styles.removePillText, { color: colors.textSecondary }]}
                >
                  Öğrendim
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => toggleFavorite(item)}
                hitSlop={8}
                style={[
                  styles.removePill,
                  { backgroundColor: colors.warningSoft },
                ]}
              >
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={[styles.removePillText, { color: colors.warning }]}>
                  Çıkar
                </Text>
              </Pressable>
            )}

            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={17}
              color={colors.textMuted}
            />
          </View>
        </View>

        <Text
          style={[styles.qText, { color: colors.text }]}
          numberOfLines={isExpanded ? undefined : 3}
        >
          {item.question}
        </Text>

        {isExpanded && (
          <View style={[styles.expandedBox, { borderTopColor: colors.border }]}>
            <View style={styles.optionsPreview}>
              {item.options.map((opt, idx) => {
                const isCorrect = idx === item.answer;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.optRow,
                      isCorrect && { backgroundColor: colors.successSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optRowText,
                        {
                          color: isCorrect
                            ? colors.success
                            : colors.textSecondary,
                          fontWeight: isCorrect ? '700' : '500',
                        },
                      ]}
                    >
                      {OPTION_LETTERS[idx]}) {opt}
                    </Text>
                  </View>
                );
              })}
            </View>

            {!!item.explanation && (
              <Text style={[styles.expText, { color: colors.textSecondary }]}>
                Çözüm: {item.explanation}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const vipLock = useVipLocked('review');
  if (vipLock) {
    return <VipLockedScreen title="Tekrar Kutusu" />;
  }

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Tekrar Kutusu</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Yanlışlarınızı eritin, yıldızlı soruları pekiştirin
        </Text>
      </View>

      {/* Main Segmented Control */}
      <View
        style={[
          styles.segmented,
          { backgroundColor: colors.surfaceSecondary },
        ]}
      >
        <Pressable
          onPress={() => {
            setActiveTab('mistakes');
            setExpandedId(null);
          }}
          style={[
            styles.segBtn,
            activeTab === 'mistakes' && { backgroundColor: colors.surface },
          ]}
        >
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={activeTab === 'mistakes' ? colors.danger : colors.textSecondary}
          />
          <Text
            style={[
              styles.segBtnText,
              {
                color:
                  activeTab === 'mistakes' ? colors.text : colors.textSecondary,
              },
            ]}
          >
            Yanlışlarım ({mistakes.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setActiveTab('favorites');
            setExpandedId(null);
          }}
          style={[
            styles.segBtn,
            activeTab === 'favorites' && { backgroundColor: colors.surface },
          ]}
        >
          <Ionicons
            name="star-outline"
            size={16}
            color={
              activeTab === 'favorites' ? colors.warning : colors.textSecondary
            }
          />
          <Text
            style={[
              styles.segBtnText,
              {
                color:
                  activeTab === 'favorites' ? colors.text : colors.textSecondary,
              },
            ]}
          >
            Favorilerim ({favorites.length})
          </Text>
        </Pressable>
      </View>

      {/* Course Filter Chips */}
      <View style={styles.chipsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          <Pressable
            onPress={() => setCourseFilter('all')}
            style={[
              styles.chip,
              {
                backgroundColor:
                  courseFilter === 'all' ? colors.primary : colors.surface,
                borderColor:
                  courseFilter === 'all' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                {
                  color: courseFilter === 'all' ? '#FFFFFF' : colors.textSecondary,
                },
              ]}
            >
              Tümü ({courseCounts.all || 0})
            </Text>
          </Pressable>

          {COURSE_LIST.map(c => {
            const count = courseCounts[c.id] || 0;
            const active = courseFilter === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCourseFilter(c.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {c.shortTitle} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Action Bar when items exist */}
      {filteredList.length > 0 && (
        <View style={styles.solveActionWrap}>
          <Pressable
            onPress={handleStartReviewQuiz}
            style={[
              styles.solveBtn,
              {
                backgroundColor:
                  activeTab === 'mistakes' ? colors.danger : colors.primary,
              },
            ]}
          >
            <Ionicons name="play" size={17} color="#FFFFFF" />
            <Text style={styles.solveBtnText}>
              {activeTab === 'mistakes'
                ? `Hata Telafi Testi Başlat (${Math.min(25, filteredList.length)} Soru)`
                : `Favori Soruları Çöz (${Math.min(25, filteredList.length)} Soru)`}
            </Text>
          </Pressable>

          {activeTab === 'mistakes' && (
            <View
              style={[
                styles.autoClearRow,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.autoClearLabel, { color: colors.textSecondary }]}
              >
                Doğru çözdüklerimi listeden otomatik düşür
              </Text>
              <Switch
                value={settings.autoClearMistakes}
                onValueChange={val => updateSettings({ autoClearMistakes: val })}
                trackColor={{ false: colors.borderStrong, true: colors.success }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}
        </View>
      )}

      {/* List */}
      <FlatList
        data={filteredList}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Ionicons
                name={
                  activeTab === 'mistakes'
                    ? 'checkmark-done-outline'
                    : 'star-outline'
                }
                size={32}
                color={
                  activeTab === 'mistakes' ? colors.success : colors.textMuted
                }
              />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {activeTab === 'mistakes'
                ? 'Bekleyen yanlış sorunuz yok'
                : 'Henüz favori soru eklenmedi'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {activeTab === 'mistakes'
                ? 'Testlerde yanlış yaptığınız sorular otomatik olarak buraya eklenir.'
                : 'Test çözerken sağ üstteki yıldız ikonuna dokunarak soruları kaydedebilirsiniz.'}
            </Text>
          </View>
        }
      />
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
    marginBottom: 10,
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
  chipsContainer: {
    marginBottom: 10,
  },
  chipsScroll: {
    paddingHorizontal: 18,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  solveActionWrap: {
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 10,
  },
  solveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
  },
  solveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  autoClearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  autoClearLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    paddingRight: 8,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 10,
  },
  qCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 9,
  },
  qCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  courseTag: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  courseTagText: {
    fontSize: 11,
    fontWeight: '800',
  },
  qCardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  removePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  removePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  qText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  expandedBox: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
    gap: 8,
  },
  optionsPreview: {
    gap: 5,
  },
  optRow: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  optRowText: {
    fontSize: 13,
    lineHeight: 18,
  },
  expText: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  emptyBox: {
    paddingVertical: 56,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
