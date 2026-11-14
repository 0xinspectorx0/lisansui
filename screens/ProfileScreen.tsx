import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme, COURSES } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { CourseId } from '../lib/types';
import { PLAN_LABEL, STATUS_LABEL, daysLeft } from '../lib/membership';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminField,
  AdminRow,
  AdminSectionTitle,
  AdminSheet,
} from '../components/admin/ui';
import { CloudStatusBanner, MembershipCta, QuotaList } from '../components/membership/ui';

export const ProfileScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { catalog } = useApp();
  const admin = useAdmin();
  const membership = useMembership();
  const { member, signedIn, isVip, quota, busy, error } = membership;

  const [nameDraft, setNameDraft] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [examDraft, setExamDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editSheet, setEditSheet] = useState(false);
  const [pwSheet, setPwSheet] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null);
  const [deletePw, setDeletePw] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (member) {
      setNameDraft(member.displayName);
      setCityDraft(member.city);
      setExamDraft(member.exam);
      setNoteDraft(member.note);
    }
  }, [member]);

  const rows = useMemo(
    () =>
      (Object.keys(catalog) as CourseId[]).map(id => ({
        course: COURSES[id].title,
        used: membership.usedFor(id),
        limit: quota.isVip || !quota.enforced ? Infinity : quota.freeTestsPerCourse,
      })),
    [catalog, membership, quota]
  );

  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
  const left = member ? daysLeft(member.vipExpiresAt) : null;
  const localUser = admin.localUser;
  const goBackSafe = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('MainTabs');
  };

  if (!signedIn) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={goBackSafe} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text }]}>Hesabım</Text>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          <CloudStatusBanner />
          <AdminCard style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
            <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons name="person" size={26} color={colors.textMuted} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '900', color: colors.text }}>Giriş yapılmamış</Text>
            <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, maxWidth: 300 }}>
              Bu cihazda {totalUsed > 0 ? `${totalUsed} deneme` : 'henüz deneme'} kayıtlı. Üye olduğunda
              ilerlemeni buluta taşıyabilir, haklarını senkron tutabilirsin.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignSelf: 'stretch' }}>
              <AdminButton label="Üye ol / Giriş yap" icon="log-in-outline" onPress={() => navigation.navigate('Auth')} flex />
              <AdminButton
                label="Buluttaki haklarımı oku"
                tone="ghost"
                icon="cloud-download-outline"
                onPress={async () => {
                  const r = await membership.restoreFromCloud();
                  setNote(r.ok ? `${r.restored} ders için bulut sayaçları işlendi` : 'Önce giriş yapman gerekiyor');
                  setTimeout(() => setNote(null), 2600);
                }}
                flex
              />
            </View>
          </AdminCard>
          <MembershipCta reason="guest" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={goBackSafe} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Hesabım</Text>
        <Pressable onPress={() => membership.refreshMember()} hitSlop={8}>
          <Ionicons name="sync-outline" size={19} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 30, gap: 12 }}>
        <CloudStatusBanner compact />
        {!!note && (
          <View style={[styles.note, { backgroundColor: colors.successSoft, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.success }}>{note}</Text>
          </View>
        )}

        <AdminCard style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.primary }}>
                {(member!.displayName || 'Ü').slice(0, 1).toLocaleUpperCase('tr-TR')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: '900', color: colors.text }}>
                {member!.displayName || 'Üye'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>
                {member!.email}
                {member!.city ? ` • ${member!.city}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <AdminChip
              label={isVip ? `VIP • ${PLAN_LABEL[member!.vipPlan]}` : 'Ücretsiz plan'}
              tone={isVip ? 'warning' : 'success'}
              icon={isVip ? 'diamond' : 'person-outline'}
            />
            <AdminChip label={STATUS_LABEL[member!.status]} tone={member!.status === 'active' ? 'success' : 'danger'} compact />
            <AdminChip label={`Rol: ${member!.role}`} tone="info" compact />
            {left !== null && (
              <AdminChip
                label={left >= 0 ? `${left} gün kaldı` : `${Math.abs(left)} gün önce bitti`}
                tone={left >= 0 ? (left <= 7 ? 'warning' : 'success') : 'danger'}
                compact
              />
            )}
          </View>
          <View style={styles.miniGrid}>
            <MiniCell label="Deneme" value={String(member!.testsCompleted || 0)} />
            <MiniCell label="Çözülen soru" value={(member!.questionsSolved || 0).toLocaleString('tr-TR')} />
            <MiniCell label="Kayıtlı ders" value={String(Object.keys(member!.courseUsage || {}).length)} />
          </View>
          <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>
            Üye kimliği: {member!.id} — bu kayıt doğrudan Supabase’daki üyelik belgen.
          </Text>
        </AdminCard>

        {!isVip && <MembershipCta reason={member!.vip && left !== null && left < 0 ? 'expired' : 'none'} />}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <AdminButton label="Hesabı düzenle" icon="create-outline" onPress={() => setEditSheet(true)} flex />
          <AdminButton label="Parola değiştir" tone="neutral" icon="key-outline" onPress={() => { setPwCurrent(''); setPwNext(''); setPwSheet(true); }} flex />
        </View>

        <AdminSectionTitle label="Test hakların" hint={quota.enforced ? (quota.isVip ? 'VIP: sınır yok' : `Ücretsiz plan: dersten ${quota.freeTestsPerCourse} test`) : 'Hak sınırı kapalı'} />
        <QuotaList rows={rows} />

        <AdminSectionTitle label="Bulut" hint="Sayılarını Supabase’e mirrora et, panelden onaylat" />
        <AdminCard>
          <AdminRow
            compact
            icon="cloud-upload-outline"
            title="Deneme sayılarımı buluta yaz"
            subtitle="Yeni cihazda haklarının sıfırlanmaması için yerel kayıtlarını üye belgesine işler"
            right={<AdminChip label={busy ? 'çalışıyor' : 'hazır'} tone="info" compact />}
            onPress={async () => {
              const courseUsage: Record<string, number> = {};
              (Object.keys(catalog) as CourseId[]).forEach(id => {
                courseUsage[id] = membership.usedFor(id);
              });
              const res = await membership.syncUsageToCloud({
                courseUsage,
                testsCompleted: totalUsed,
                questionsSolved: localUser.solved || 0,
              });
              setNote(res.ok ? 'Yerel sayılar üyelik belgenize yazıldı' : 'Buluta yazılamadı — kural/çevrimdışı kontrol et');
              setTimeout(() => setNote(null), 2800);
            }}
          />
          <AdminRow
            compact
            icon="cloud-download-outline"
            title="Buluttaki haklarımı geri yükle"
            subtitle="Bu cihazdan silinmiş deneme geçmişini üye belgesindeki sayaçlardan tamamlar"
            onPress={async () => {
              const r = await membership.restoreFromCloud();
              setNote(r.ok ? `Bulut sayaçları yerel geçmişe işlendi (${r.restored} ders)` : 'Bu işlem için giriş gerekli');
              setTimeout(() => setNote(null), 2600);
            }}
          />
          <AdminRow
            compact
            icon="refresh-outline"
            title="Üyelik belgesini yenile"
            subtitle="VIP onayı verdiysen panelde, burada tek dokunuşla güncellenir"
            onPress={() => membership.refreshMember()}
          />
          <AdminRow
            compact
            icon={localUser.vip ? 'diamond' : 'diamond-outline'}
            title="Bu cihazı VIP göster (yalnızca yönetici)"
            subtitle="Panelde açıkken çalışır; Supabase belgeni değiştirmez"
            onPress={() => admin.toggleVip(localUser.id)}
          />
        </AdminCard>

        {!!error && (
          <View style={[styles.note, { backgroundColor: colors.dangerSoft, borderColor: colors.border }]}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.danger, lineHeight: 17 }}>{error}</Text>
          </View>
        )}

        <AdminCard>
          <AdminRow
            compact
            icon="log-out-outline"
            title="Çıkış yap"
            subtitle="Yerel ilerlemen cihazda kalır"
            onPress={() => setConfirm('signout')}
          />
          <AdminRow
            compact
            icon="trash-bin-outline"
            title="Hesabımı sil"
            subtitle="Üyelik belgen Supabase’dan kalıcı olarak silinir"
            right={<Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
            onPress={() => { setDeletePw(''); setConfirm('delete'); }}
            style={{ borderBottomWidth: 0 }}
          />
        </AdminCard>
      </View>

      <AdminSheet
        visible={editSheet}
        title="Hesap bilgileri"
        onClose={() => setEditSheet(false)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setEditSheet(false)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              disabled={busy}
              onPress={async () => {
                const res = await membership.updateProfile({
                  displayName: nameDraft,
                  city: cityDraft,
                  exam: examDraft,
                  note: noteDraft,
                });
                if (res.ok) setEditSheet(false);
              }}
              flex
            />
          </>
        }
      >
        <AdminField label="Ad soyad" value={nameDraft} onChangeText={setNameDraft} />
        <AdminField label="Şehir" value={cityDraft} onChangeText={setCityDraft} />
        <AdminField
          label="Hazırlandığım sınav"
          value={examDraft}
          onChangeText={setExamDraft}
        />
        <AdminField label="Kısa not" value={noteDraft} onChangeText={setNoteDraft} multiline />
      </AdminSheet>

      <AdminSheet
        visible={pwSheet}
        title="Parola değiştir"
        onClose={() => setPwSheet(false)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setPwSheet(false)} flex />
            <AdminButton
              label="Güncelle"
              icon="key-outline"
              disabled={busy || pwNext.length < 6}
              onPress={async () => {
                const res = await membership.changePassword(pwCurrent, pwNext);
                if (res.ok) setPwSheet(false);
              }}
              flex
            />
          </>
        }
      >
        <AdminField label="Mevcut parola" value={pwCurrent} onChangeText={setPwCurrent} />
        <AdminField label="Yeni parola" value={pwNext} onChangeText={setPwNext} hint="en az 6 karakter — doğrulayıcı cihazda üretilir, buluta hash+tuz yazılır" multiline={false} />
      </AdminSheet>

      <AdminSheet
        visible={confirm === 'delete'}
        title="Hesabı sil"
        onClose={() => setConfirm(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setConfirm(null)} flex />
            <AdminButton
              label="Kalıcı olarak sil"
              tone="danger"
              icon="trash-bin-outline"
              disabled={busy || !deletePw}
              onPress={async () => {
                const res = await membership.deleteAccount(deletePw);
                setConfirm(null);
                if (res.ok) goBackSafe();
              }}
              flex
            />
          </>
        }
      >
        <Text style={{ fontSize: 12.5, color: colors.textSecondary, lineHeight: 18, paddingBottom: 10 }}>
          Üyelik belgen Supabase’dan silinir ve bu cihazda çıkış yapılır. Çalışma geçmişin
          (deneme, favori, hata defteri) cihazda kalmaya devam eder.
        </Text>
        <AdminField label="Onay için parolan" value={deletePw} onChangeText={setDeletePw} />
      </AdminSheet>

      <AdminConfirm
        visible={confirm === 'signout'}
        title="Çıkış yap"
        confirmLabel="Çıkış"
        message="Üyelik belgen bulutta durur, istediğin zaman tekrar giriş yapabilirsin."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await membership.signOut();
        }}
      />
    </SafeAreaView>
  );
};

const MiniCell: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 9 }}>
      <Text style={{ fontSize: 14, fontWeight: '900', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: colors.textMuted }}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '900' },
  avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  miniGrid: { flexDirection: 'row', gap: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, borderWidth: 1 },
});
