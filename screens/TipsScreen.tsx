import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

import { useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';

type ViewMode = 'card' | 'list';
type TipFilter = 'all' | 'unlearned' | 'saved';

export const TipsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const {
    dailyTips,
    learnedTips,
    savedTips,
    toggleTipLearned,
    toggleTipSaved,
    refreshTips,
  } = useApp();

  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [filter, setFilter] = useState<TipFilter>('all');
  const [search, setSearch] = useState('');
  const [cardIndex, setCardIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const learnedCount = useMemo(
    () => dailyTips.filter(t => !!learnedTips[t]).length,
    [dailyTips, learnedTips]
  );

  const savedCount = useMemo(
    () => dailyTips.filter(t => !!savedTips[t]).length,
    [dailyTips, savedTips]
  );

  const filteredTips = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return dailyTips.filter(tip => {
      if (filter === 'unlearned' && learnedTips[tip]) return false;
      if (filter === 'saved' && !savedTips[tip]) return false;
      if (viewMode === 'list' && q && !tip.toLocaleLowerCase('tr-TR').includes(q)) {
        return false;
      }
      return true;
    });
  }, [dailyTips, filter, learnedTips, savedTips, search, viewMode]);

  useEffect(() => {
    if (cardIndex >= filteredTips.length) {
      setCardIndex(0);
    }
  }, [filteredTips.length, cardIndex]);

  const currentTip =
    filteredTips.length > 0
      ? filteredTips[Math.min(cardIndex, filteredTips.length - 1)]
      : null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshTips();
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkLearnedInDeck = (tip: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const wasLearned = !!learnedTips[tip];
    toggleTipLearned(tip);
    if (!wasLearned && filter !== 'unlearned' && cardIndex < filteredTips.length - 1) {
      setCardIndex(prev => prev + 1);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Hap Bilgiler</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {learnedCount}/{dailyTips.length} öğrenildi • Nokta atışı KPSS notları
          </Text>
        </View>

        <View
          style={[
            styles.modeSwitch,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <Pressable
            onPress={() => setViewMode('card')}
            style={[
              styles.modeBtn,
              viewMode === 'card' && { backgroundColor: colors.surface },
            ]}
          >
            <Ionicons
              name="albums-outline"
              size={16}
              color={viewMode === 'card' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.modeBtnText,
                {
                  color: viewMode === 'card' ? colors.text : colors.textSecondary,
                },
              ]}
            >
              Kart
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setViewMode('list')}
            style={[
              styles.modeBtn,
              viewMode === 'list' && { backgroundColor: colors.surface },
            ]}
          >
            <Ionicons
              name="list-outline"
              size={16}
              color={viewMode === 'list' ? colors.primary : colors.textSecondary}
            />
            <Text
              style={[
                styles.modeBtnText,
                {
                  color: viewMode === 'list' ? colors.text : colors.textSecondary,
                },
              ]}
            >
              Liste
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Filter Pills */}
      <View style={styles.filterRow}>
        {(
          [
            { key: 'all', label: `Tümü (${dailyTips.length})` },
            {
              key: 'unlearned',
              label: `Öğrenilecek (${dailyTips.length - learnedCount})`,
            },
            { key: 'saved', label: `Kaydedilen (${savedCount})` },
          ] as { key: TipFilter; label: string }[]
        ).map(item => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                setFilter(item.key);
                setCardIndex(0);
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active
                    ? colors.primary
                    : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: active ? '#FFFFFF' : colors.textSecondary },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {viewMode === 'card' ? (
        <View style={styles.deckContainer}>
          {!currentTip ? (
            <View
              style={[
                styles.emptyDeckCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons
                name="checkmark-done-circle-outline"
                size={44}
                color={colors.success}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {filter === 'saved'
                  ? 'Henüz kaydedilmiş bilgi yok'
                  : 'Bu filtredeki tüm bilgileri tamamladınız!'}
              </Text>
              <Pressable
                onPress={() => setFilter('all')}
                style={[styles.resetFilterBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.resetFilterText}>Tüm Bilgilere Dön</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.flashcard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.flashcardTop}>
                  <View
                    style={[
                      styles.indexPill,
                      { backgroundColor: colors.primarySoft },
                    ]}
                  >
                    <Text style={[styles.indexPillText, { color: colors.primary }]}>
                      BİLGİ {cardIndex + 1} / {filteredTips.length}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => toggleTipSaved(currentTip)}
                    hitSlop={10}
                    style={[
                      styles.bookmarkCircle,
                      {
                        backgroundColor: savedTips[currentTip]
                          ? colors.warningSoft
                          : colors.surfaceSecondary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={savedTips[currentTip] ? 'bookmark' : 'bookmark-outline'}
                      size={18}
                      color={
                        savedTips[currentTip] ? colors.warning : colors.textSecondary
                      }
                    />
                  </Pressable>
                </View>

                <View style={styles.flashcardCenter}>
                  <Text style={[styles.flashcardText, { color: colors.text }]}>
                    {currentTip}
                  </Text>
                </View>

                <View style={styles.flashcardBottom}>
                  <Pressable
                    onPress={() => handleMarkLearnedInDeck(currentTip)}
                    style={[
                      styles.learnedBtn,
                      {
                        backgroundColor: learnedTips[currentTip]
                          ? colors.successSoft
                          : colors.surfaceSecondary,
                        borderColor: learnedTips[currentTip]
                          ? colors.success
                          : colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        learnedTips[currentTip]
                          ? 'checkmark-circle'
                          : 'ellipse-outline'
                      }
                      size={18}
                      color={
                        learnedTips[currentTip]
                          ? colors.success
                          : colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.learnedBtnText,
                        {
                          color: learnedTips[currentTip]
                            ? colors.success
                            : colors.text,
                        },
                      ]}
                    >
                      {learnedTips[currentTip] ? 'Öğrenildi' : 'Öğrendim İşaretle'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Deck Controls */}
              <View style={styles.deckControls}>
                <Pressable
                  onPress={() =>
                    setCardIndex(prev =>
                      prev === 0 ? filteredTips.length - 1 : prev - 1
                    )
                  }
                  style={[
                    styles.deckNavBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.text} />
                  <Text style={[styles.deckNavText, { color: colors.text }]}>
                    Önceki
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (filteredTips.length <= 1) return;
                    const rand = Math.floor(Math.random() * filteredTips.length);
                    setCardIndex(rand);
                  }}
                  style={[
                    styles.shuffleCircle,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="shuffle" size={20} color={colors.primary} />
                </Pressable>

                <Pressable
                  onPress={() =>
                    setCardIndex(prev => (prev + 1) % filteredTips.length)
                  }
                  style={[
                    styles.deckNavBtnPrimary,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.deckNavTextPrimary}>Sonraki</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.listWrap}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="search-outline" size={17} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Hap bilgiler içinde ara..."
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

          <FlatList
            data={filteredTips}
            keyExtractor={(item, idx) => `${idx}_${item.slice(0, 24)}`}
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
              <View style={styles.emptyListBox}>
                <Ionicons
                  name="document-text-outline"
                  size={34}
                  color={colors.textMuted}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  Sonuç bulunamadı
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isLearned = !!learnedTips[item];
              const isSaved = !!savedTips[item];
              return (
                <View
                  style={[
                    styles.listItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => toggleTipLearned(item)}
                    hitSlop={8}
                    style={styles.listCheck}
                  >
                    <Ionicons
                      name={isLearned ? 'checkmark-circle' : 'ellipse-outline'}
                      size={21}
                      color={isLearned ? colors.success : colors.textMuted}
                    />
                  </Pressable>

                  <Text
                    style={[
                      styles.listItemText,
                      {
                        color: colors.text,
                        opacity: isLearned ? 0.65 : 1,
                      },
                    ]}
                  >
                    {item}
                  </Text>

                  <Pressable
                    onPress={() => toggleTipSaved(item)}
                    hitSlop={8}
                    style={styles.listSave}
                  >
                    <Ionicons
                      name={isSaved ? 'bookmark' : 'bookmark-outline'}
                      size={18}
                      color={isSaved ? colors.warning : colors.textMuted}
                    />
                  </Pressable>
                </View>
              );
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
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
  modeSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deckContainer: {
    flex: 1,
    paddingHorizontal: 18,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  flashcard: {
    flex: 1,
    maxHeight: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    justifyContent: 'space-between',
    marginTop: 6,
  },
  flashcardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  indexPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  indexPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bookmarkCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcardCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  flashcardText: {
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  flashcardBottom: {
    alignItems: 'center',
  },
  learnedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  learnedBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deckControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  deckNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
  },
  deckNavText: {
    fontSize: 14,
    fontWeight: '700',
  },
  shuffleCircle: {
    width: 50,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckNavBtnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 50,
    borderRadius: 15,
  },
  deckNavTextPrimary: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emptyDeckCard: {
    flex: 1,
    maxHeight: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  resetFilterBtn: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  resetFilterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listWrap: {
    flex: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 18,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 9,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 15,
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  listCheck: {
    marginTop: 1,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  listSave: {
    marginTop: 1,
  },
  emptyListBox: {
    paddingVertical: 56,
    alignItems: 'center',
    gap: 8,
  },
});
