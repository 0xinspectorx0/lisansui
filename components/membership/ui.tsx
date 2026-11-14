import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../../lib/theme';
import { useMembership } from '../../lib/MembershipContext';
import { PLAN_LABEL, daysLeft } from '../../lib/membership';
import { AdminButton, AdminCard, AdminChip } from '../admin/ui';

/** Compact status pill for the app header: VIP / ÜYE / Misafir. */
export const MembershipPill: React.FC = () => {
  const navigation = useNavigation<any>();
  const { signedIn, isVip, member } = useMembership();

  const label = !signedIn
    ? 'Misafir'
    : isVip
    ? `VIP • ${PLAN_LABEL[member!.vipPlan]}`
    : 'Üye';
  const tone = isVip ? 'warning' : signedIn ? 'success' : 'default';

  return (
    <AdminChip
      label={label}
      tone={tone as any}
      icon={isVip ? 'diamond' : signedIn ? 'person' : 'person-add-outline'}
      compact
      onPress={() => navigation.navigate(signedIn ? 'Profile' : 'Auth')}
    />
  );
};

/** Cloud connectivity / rules explainer, shown on the auth + admin membership screens. */
export const CloudStatusBanner: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { colors } = useAppTheme();
  const { cloudStatus, cloudMessage } = useMembership();
  if (cloudStatus === 'online' || cloudStatus === 'unknown') return null;

  const denied = cloudStatus === 'denied';
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: denied ? colors.warningSoft : colors.dangerSoft,
          borderColor: colors.border,
        },
      ]}
    >
      <Ionicons
        name={denied ? 'shield-checkmark-outline' : 'cloud-offline'}
        size={16}
        color={denied ? colors.warning : colors.danger}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.bannerTitle,
            { color: denied ? colors.warning : colors.danger },
          ]}
        >
          {denied
            ? 'Supabase yazma/okuma kuralı engelledi'
            : cloudStatus === 'offline'
              ? 'Supabase’e ulaşılamadı'
              : 'Supabase işlemi başarısız'}
        </Text>
        {!!cloudMessage && (
          <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
            {cloudMessage}
          </Text>
        )}
        {!compact && denied && (
          <Text style={[styles.bannerText, { color: colors.textMuted }]}>
            Admin → Ayarlar → “SQL — tablolar ve RLS” bölümündeki SQL metnini Supabase SQL
            Editor’de çalıştırman yeterli. Üyelik kayıtları yalnızca Supabase’de tutulduğu için
            tablolar ve RLS kuralları olmadan kayıt açılamaz.
          </Text>
        )}
      </View>
    </View>
  );
};

/** Quota row used on the paywall and profile screens. */
export const QuotaList: React.FC<{
  rows: { course: string; used: number; limit: number }[];
}> = ({ rows }) => {
  const { colors } = useAppTheme();
  return (
    <AdminCard pad={4}>
      {rows.map((r, i) => {
        const unlimited = r.limit === Infinity;
        const left = unlimited ? Infinity : Math.max(0, r.limit - r.used);
        return (
          <View
            key={r.course}
            style={[
              styles.quotaRow,
              i < rows.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: colors.text }}>
              {r.course}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginRight: 8 }}>
              {unlimited ? 'Sınırsız' : `${Math.min(r.used, r.limit as number)}/${r.limit} test`}
            </Text>
            <AdminChip
              label={unlimited ? 'VIP' : left > 0 ? `${left} hak` : 'Hakkın bitti'}
              tone={unlimited ? 'warning' : left > 0 ? 'success' : 'danger'}
              compact
            />
          </View>
        );
      })}
    </AdminCard>
  );
};

/** "VIP expired / not VIP" explainer with the two honest CTAs. */
export const MembershipCta: React.FC<{ reason?: 'expired' | 'none' | 'guest' }> = ({
  reason = 'none',
}) => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { signedIn, member } = useMembership();
  const left = member ? daysLeft(member.vipExpiresAt) : null;

  const title =
    reason === 'guest'
      ? 'Ücretsiz deneme hakkın: her dersten 1 test'
      : reason === 'expired'
      ? 'VIP süren doldu'
      : 'Hesabın ücretsiz planda';

  return (
    <AdminCard style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name="diamond-outline" size={17} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: colors.text }}>{title}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
            {reason === 'expired' && left !== null
              ? `${Math.abs(left)} gün önce sona erdi. Yenilediğinde tüm bölümler açılır.`
              : signedIn
              ? 'Ücretli plan, konu testlerinde hak sınırı olmadan ve tüm bölümleri açık kullanır.'
              : 'Üye olarak ilerlemeni buluta taşıyabilir, her dersten 1 ücretsiz testini çözebilirsin.'}
          </Text>
        </View>
      </View>
      <View style={styles.ctaRow}>
        <AdminButton
          small
          label={signedIn ? 'Profile' : 'Üye ol / Giriş yap'}
          icon={signedIn ? 'person-outline' : 'person-add-outline'}
          onPress={() => navigation.navigate(signedIn ? 'Profile' : 'Auth')}
          flex
        />
        <AdminButton
          small
          tone="ghost"
          label="Yönetici onaylasın"
          icon="shield-checkmark-outline"
          onPress={() => navigation.navigate('AdminLogin')}
          flex
        />
      </View>
    </AdminCard>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: 8,
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  bannerTitle: { fontSize: 12.5, fontWeight: '900' },
  bannerText: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4 },
  iconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
