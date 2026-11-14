import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../../lib/theme';
import { useAdmin, type VipGateKey } from '../../lib/AdminContext';
import { useMembership } from '../../lib/MembershipContext';
import { AdminButton } from './ui';

/**
 * True when the admin switched this gate on and the current member is not VIP.
 * VIP state comes from the Supabase membership document (or the local admin
 * profile when the panel disables cloud VIP), never from a cached flag.
 */
export function useVipLocked(gate: VipGateKey): boolean {
  const admin = useAdmin();
  const { isVip } = useMembership();
  return !!admin.settings.vipGates[gate] && !isVip;
}

/**
 * Full-screen replacement for a tab that the admin marked as VIP-only.
 * Renders nothing when the gate is off, so it can be returned early.
 */
export const VipLockedScreen: React.FC<{ title: string; hint?: string }> = ({
  title,
  hint,
}) => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const admin = useAdmin();

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.crown, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="diamond" size={22} color={colors.warning} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title} VIP’e özel</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {hint ||
              'Yönetici paneli bu bölümü yalnızca VIP üyelere açtı. Bu cihaza VIP verebilir veya kapıyı kapatabilirsin.'}
          </Text>
          <View style={styles.actions}>
            <AdminButton
              small
              label={admin.isVip ? 'Yerel VIP’i kapat' : 'Bu cihaza VIP ver (yerel)'}
              icon="diamond-outline"
              tone="ghost"
              onPress={() => admin.toggleVip(admin.localUser.id)}
            />
            <AdminButton
              small
              label="Panelde kapıyı aç/kapat"
              icon="settings-outline"
              onPress={() => navigation.navigate('AdminSettings')}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

/** Compact VIP pill for headers — reflects the cloud membership record. */
export const VipBadge: React.FC = () => {
  const { colors } = useAppTheme();
  const { isVip } = useMembership();
  if (!isVip) return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.warningSoft, borderColor: colors.border }]}>
      <Ionicons name="diamond" size={12} color={colors.warning} />
      <Text style={[styles.badgeText, { color: colors.warning }]}>VIP</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: 'flex-start',
    gap: 6,
    maxWidth: 380,
    width: '100%',
  },
  crown: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  hint: { fontSize: 12.5, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
});
