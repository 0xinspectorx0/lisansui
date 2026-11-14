import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme, COURSES } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { CourseId } from '../lib/types';
import { PLAN_LABEL } from '../lib/membership';
import { AdminButton, AdminCard, AdminChip, AdminRow, AdminSectionTitle } from '../components/admin/ui';
import { CloudStatusBanner, MembershipCta, QuotaList } from '../components/membership/ui';

const PLANS: { id: 'monthly' | 'yearly' | 'lifetime'; label: string; price: string; perk: string; save?: string }[] = [
  { id: 'monthly', label: 'Aylık', price: '₺149', perk: 'Tüm bölümler + sınırsız test' },
  { id: 'yearly', label: 'Yıllık', price: '₺990', perk: 'Aylığa göre 4 ay bedava', save: '%45 indirim' },
  { id: 'lifetime', label: 'Ömür boyu', price: '₺2.450', perk: 'Tek ödeme, yeni KPSS içerikleri dahil' },
];

export const MembershipPaywallScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { catalog, settings, updateSettings } = useApp();
  const membership = useMembership();
  const admin = useAdmin();
  const { member, quota, signedIn, isVip } = membership;

  const rows = useMemo(
    () =>
      (Object.keys(catalog) as CourseId[]).map(id => ({
        course: COURSES[id].title,
        used: membership.usedFor(id),
        limit: quota.isVip || !quota.enforced ? Infinity : quota.freeTestsPerCourse,
      })),
    [catalog, membership, quota]
  );

  const blockedCourse = admin.state.content.courseOrder.find(
    id => rows.find(r => r.course === COURSES[id].title)?.used === quota.freeTestsPerCourse
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>VIP üyelik</Text>
        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.primary }}>Hesabım</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <CloudStatusBanner compact />

        {isVip ? (
          <AdminCard style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
                <Ionicons name="diamond" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '900', color: colors.text }}>
                  VIP üyelik aktif • {member ? PLAN_LABEL[member.vipPlan] : 'Yerel profil'}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Test hakkı sınırı senin için çalışmıyor. İyi çalışmalar!
                </Text>
              </View>
            </View>
            <AdminButton label="Çalışmaya dön" icon="play-circle-outline" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch' }} />
          </AdminCard>
        ) : (
          <>
            <AdminCard style={{ gap: 10, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.iconWrap, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="lock-closed" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '900', color: colors.text }}>
                    {signedIn ? 'Ücretsiz plan hakkın bitti' : 'Üye ol, ilk testler senin'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 }}>
                    {quota.enforced
                      ? `Üye olmayan ve ücretsiz plan her dersten ${quota.freeTestsPerCourse} test çözüyor. VIP’te bu sınır yok.`
                      : 'Şu an hak sınırı kapalı; yine de VIP tüm ayrıcalıkları açar.'}
                  </Text>
                </View>
              </View>
              {!signedIn && (
                <AdminButton
                  label="Üye ol / Giriş yap"
                  icon="person-add-outline"
                  onPress={() => navigation.navigate('Auth')}
                  style={{ alignSelf: 'stretch' }}
                />
              )}
            </AdminCard>

            <AdminSectionTitle label="Hak durumun" hint="Yerel deneme kayıtların + buluta yansıtan sayaçların birlikte sayılır" />
            <QuotaList rows={rows} />

            <AdminSectionTitle label="Planlar" hint="Onay sonrası VIP, Supabase üyelik belgene yazılır" />
            <View style={{ gap: 8 }}>
              {PLANS.map(plan => (
                <AdminCard key={plan.id} pad={12}>
                  <AdminRow
                    compact
                    icon={plan.id === 'lifetime' ? 'infinity-outline' : plan.id === 'yearly' ? 'calendar-outline' : 'time-outline'}
                    title={`${plan.label} • ${plan.price}`}
                    subtitle={plan.perk}
                    right={<RequestButton plan={plan.id} label="Talep et" />}
                  />
                  {!!plan.save && (
                    <View style={{ paddingLeft: 42, marginTop: -6, paddingBottom: 4 }}>
                      <AdminChip label={plan.save} tone="success" compact />
                    </View>
                  )}
                </AdminCard>
              ))}
            </View>

            <View style={{ marginTop: 14 }}>
              <MembershipCta reason={signedIn ? 'expired' : 'guest'} />
            </View>

            <AdminSectionTitle label="Alternatif" hint="Sınav tarihini ve günlük hedefi kendi ritmine göre ayarla" />
            <AdminCard>
              <View style={styles.goalRow}>
                <Text style={{ flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 }}>
                  Günlük hedefini düşürüp ücretsiz haklarınla düzenli gitmeyi tercih edebilirsin.
                </Text>
                <AdminButton
                  small
                  tone="neutral"
                  label={`${settings.dailyGoal} soru`}
                  icon="options-outline"
                  onPress={() => updateSettings({ dailyGoal: Math.max(10, settings.dailyGoal - 20) })}
                />
              </View>
            </AdminCard>
            {!!blockedCourse && (
              <Text style={[styles.foot, { color: colors.textMuted }]}>
                Son denemen {COURSES[blockedCourse].title} dersinin hakkını doldurdu.
              </Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const RequestButton: React.FC<{ plan: 'monthly' | 'yearly' | 'lifetime'; label: string }> = ({
  plan,
  label,
}) => {
  const membership = useMembership();
  const admin = useAdmin();
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  // A signed-in member can request an upgrade: we flip the local admin profile and,
  // when the cloud membership document is available, write a pending note on it.
  const press = async () => {
    if (state === 'busy') return;
    setState('busy');
    try {
      const note = `VIP talebi: ${PLAN_LABEL[plan]} (ödeme bekleniyor)`;
      if (membership.member) {
        const res = await membership.adminUpsertMember({
          ...membership.member,
          note,
        });
        if (!res.ok) setState('error');
        else setState('done');
      }
      admin.patchUser(admin.localUser.id, { note });
      if (!membership.member) setState('done');
    } catch {
      setState('error');
    }
  };

  const map = {
    idle: { label, icon: 'paper-plane-outline' as const, tone: 'primary' as const },
    busy: { label: 'Gönderiliyor…', icon: 'hourglass-outline' as const, tone: 'neutral' as const },
    done: { label: 'Talebin iletildi', icon: 'checkmark-circle-outline' as const, tone: 'success' as const },
    error: { label: 'Buluta yazılamadı', icon: 'alert-circle-outline' as const, tone: 'danger' as const },
  }[state];

  return (
    <AdminButton small tone={map.tone} icon={map.icon} label={map.label} onPress={press} disabled={state === 'busy' || state === 'done'} />
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '900' },
  body: { flex: 1, paddingHorizontal: 16, paddingBottom: 30 },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  foot: { fontSize: 11.5, textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
