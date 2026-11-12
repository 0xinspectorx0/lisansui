import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CourseConfig } from '../lib/types';
import { useAppTheme } from '../lib/theme';

interface CourseCardProps {
  course: CourseConfig;
  totalQuestions: number;
  activeTopicsCount: number;
  solvedTestsCount: number;
  accuracyPercent: number | null;
  onPress: () => void;
  /** Free membership quota is exhausted for this course. */
  quotaBlocked?: boolean;
  remainingTests?: number;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  totalQuestions,
  activeTopicsCount,
  solvedTestsCount,
  accuracyPercent,
  onPress,
  quotaBlocked,
  remainingTests,
}) => {
  const { colors } = useAppTheme();
  const accent = colors.isDark ? course.accentDark : course.accentLight;
  const softBg = colors.isDark ? course.softBgDark : course.softBgLight;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: softBg }]}>
          <Ionicons name={course.icon as any} size={22} color={accent} />
        </View>

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]}>{course.title}</Text>
            {accuracyPercent !== null && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor:
                      accuracyPercent >= 70
                        ? colors.successSoft
                        : accuracyPercent >= 45
                        ? colors.warningSoft
                        : colors.dangerSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color:
                        accuracyPercent >= 70
                          ? colors.success
                          : accuracyPercent >= 45
                          ? colors.warning
                          : colors.danger,
                    },
                  ]}
                >
                  %{accuracyPercent} Başarı
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {activeTopicsCount} hazır konu • {totalQuestions.toLocaleString('tr-TR')} soru
            {solvedTestsCount > 0 ? ` • ${solvedTestsCount} test çözüldü` : ''}
          </Text>

          {quotaBlocked || (remainingTests !== undefined && Number.isFinite(remainingTests)) ? (
            <View style={styles.quotaRow}>
              <View
                style={[
                  styles.quotaChip,
                  {
                    backgroundColor: quotaBlocked ? colors.warningSoft : colors.primarySoft,
                    borderColor: quotaBlocked ? colors.warning : 'transparent',
                  },
                ]}
              >
                <Ionicons
                  name={quotaBlocked ? 'lock-closed' : 'gift-outline'}
                  size={11}
                  color={quotaBlocked ? colors.warning : colors.primary}
                />
                <Text
                  style={[
                    styles.quotaChipText,
                    { color: quotaBlocked ? colors.warning : colors.primary },
                  ]}
                >
                  {quotaBlocked
                    ? 'Ücretsiz hak bitti'
                    : `${remainingTests} ücretsiz test hakkı`}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  quotaRow: { marginTop: 6 },
  quotaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  quotaChipText: { fontSize: 10.5, fontWeight: '900' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    fontSize: 13,
    fontWeight: '500',
  },
});
