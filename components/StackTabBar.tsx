import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useMembership } from '../lib/MembershipContext';
import { ProfileIcon } from './ProfileButton';
import type { MainTabParamList } from '../lib/types';

export type StackTabTarget = keyof MainTabParamList;

/** Same five actions as the tabs, for screens above MainTabs in the stack. */
export const StackTabBar: React.FC<{ routeName: string; onSelect: (tab: StackTabTarget) => void }> = ({ routeName, onSelect }) => {
  const { colors } = useAppTheme();
  const { mistakes } = useApp();
  const { signedIn, isVip } = useMembership();
  const { bottom } = useSafeAreaInsets();
  const tabs: { key: StackTabTarget; label: string; icon?: 'book-outline' | 'bulb-outline' | 'refresh-circle-outline' | 'stats-chart-outline'; size?: number }[] = [
    { key: 'HomeTab', label: 'Çalış', icon: 'book-outline', size: 22 },
    { key: 'TipsTab', label: 'Hap Bilgi', icon: 'bulb-outline', size: 22 },
    { key: 'ReviewTab', label: 'Tekrarım', icon: 'refresh-circle-outline', size: 23 },
    { key: 'FocusStatsTab', label: 'Odak & Net', icon: 'stats-chart-outline', size: 21 },
    { key: 'ProfileTab', label: signedIn ? (isVip ? 'VIP Profil' : 'Profil') : 'Giriş' },
  ];
  return (
    <View style={[styles.bar, { height: 64 + bottom, paddingBottom: 3 + bottom, backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {tabs.map(tab => {
        const selected = tab.key === 'ProfileTab' && (routeName === 'Profile' || routeName === 'Auth');
        const color = selected ? colors.primary : colors.textMuted;
        return (
          <Pressable key={tab.key} accessibilityRole="button" accessibilityState={{ selected }}
            accessibilityLabel={tab.key === 'ProfileTab' ? (signedIn ? (isVip ? 'Hesabım, VIP üye' : 'Hesabım') : 'Giriş yap') : tab.label}
            onPress={() => onSelect(tab.key)} style={styles.item}>
            <View style={styles.icon}>
              {tab.icon ? <Ionicons name={tab.icon} size={tab.size} color={color} /> : <ProfileIcon signedIn={signedIn} isVip={isVip} color={color} />}
              {tab.key === 'ReviewTab' && mistakes.length > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                  <Text style={styles.badgeText}>{mistakes.length > 99 ? '99+' : mistakes.length}</Text>
                </View>
              )}
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 3, zIndex: 20 },
  item: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  badge: { position: 'absolute', top: -3, left: 19, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
