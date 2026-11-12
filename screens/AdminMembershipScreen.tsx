/**
 * Üyelik paneli — every member record here is a Firestore document
 * (`memberships/{emailNormalized}`), read and written directly by this screen.
 * There is no local membership store to fall back to: if the cloud write fails,
 * the row is not changed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { hashPassword } from '../lib/crypto';
import { CloudStatusBanner } from '../components/membership/ui';
import {
  emptyMember,
  daysLeft,
  isVipActive,
  normalizeEmail,
  type MemberRole,
  PLAN_LABEL,
  STATUS_LABEL,
  type MemberDoc,
  type MembershipStatus,
  type VipPlanId,
} from '../lib/membership';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminEmpty,
  AdminField,
  AdminIconButton,
  AdminRow,
  AdminScaffold,
  AdminSearchBar,
  AdminSectionTitle,
  AdminSegmented,
  AdminSheet,
  AdminSpinner,
  AdminStat,
  AdminToggle,
} from '../components/admin/ui';

type FilterId = 'all' | 'vip' | 'free' | 'pending' | 'blocked';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'vip', label: 'VIP' },
  { id: 'free', label: 'Ücretsiz' },
  { id: 'pending', label: 'Onay bekleyen' },
  { id: 'blocked', label: 'Kısıtlı' },
];

const STATUS_TONE: Record<MembershipStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'warning',
  banned: 'danger',
};

interface Draft {
  isNew: boolean;
  email: string;
  displayName: string;
  password: string;
  city: string;
  exam: string;
  note: string;
  role: MemberRole;
  status: MembershipStatus;
  plan: VipPlanId;
}

const blankDraft: Draft = {
  isNew: true,
  email: '',
  displayName: '',
  password: '',
  city: '',
  exam: 'KPSS Lisans (GY-GK)',
  note: '',
  role: 'user',
  status: 'active',
  plan: 'free',
};

export const AdminMembershipScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const admin = useAdmin();
  const membership = useMembership();
  const policy = admin.settings.membership ?? {
    enforce: true,
    freeTestsPerCourse: 1,
    cloudVip: true,
    cloudMembers: true,
    defaultTrialDays: 0,
    requireApproval: false,
  };

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MemberDoc | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const res = await membership.adminListMembers();
      setMembers(res.members);
      const count = admin.syncCloudMembers(res.members);
      if (res.error) setNotice(res.error);
      else if (!silent) {
        setNotice(
          `${count.cloud} üye Firestore’dan alındı${res.limited ? ' (liste sayfalı, tamamlanmadı)' : ''}.`
        );
      }
      setLoading(false);
    },
    [admin, membership]
  );

  // NOTE: `load` is deliberately kept out of the dependency array. It closes over
  // `admin`, and loading calls admin.syncCloudMembers (which bumps the admin
  // revision) — depending on it would re-trigger this effect forever.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (policy.cloudMembers) void loadRef.current(true);
    // membersVersion bumps after every successful cloud write, so the list stays honest.
  }, [policy.cloudMembers, membership.membersVersion]);

  const patchPolicy = (patch: Partial<typeof policy>) => {
    admin.patchSettings({ membership: { ...policy, ...patch } });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return members.filter(m => {
      if (q) {
        const hay = `${m.displayName} ${m.email} ${m.city}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      if (filter === 'vip') return isVipActive(m);
      if (filter === 'free') return !isVipActive(m);
      if (filter === 'pending') return m.status === 'pending';
      if (filter === 'blocked') return m.status === 'banned' || m.status === 'suspended';
      return true;
    });
  }, [members, search, filter]);

  const vipCount = members.filter(isVipActive).length;
  const pendingCount = members.filter(m => m.status === 'pending').length;
  const testsToday = members.reduce((sum, m) => sum + (m.testsCompleted ?? 0), 0);

  const openEdit = (m: MemberDoc) => {
    setDraft({
      isNew: false,
      email: m.email,
      displayName: m.displayName,
      password: '',
      city: m.city ?? '',
      exam: m.exam ?? '',
      note: m.note ?? '',
      role: m.role,
      status: m.status,
      plan: isVipActive(m) ? m.vipPlan : m.vip ? m.vipPlan : 'free',
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    const email = normalizeEmail(draft.email);
    const base: MemberDoc = draft.isNew
      ? emptyMember(email)
      : members.find(m => m.id === email) ?? emptyMember(email);
    const next: MemberDoc = {
      ...base,
      id: email,
      email,
      emailNormalized: email,
      displayName: draft.displayName.trim() || email.split('@')[0],
      role: draft.role,
      status: draft.status,
      city: draft.city.trim(),
      exam: draft.exam.trim(),
      note: draft.note.trim(),
      vip: draft.plan !== 'free',
      vipPlan: draft.plan,
      vipExpiresAt: planExpiry(draft.plan, base.vipExpiresAt),
    };
    if (draft.isNew) {
      if (draft.password.trim().length < 6) {
        setNotice('Şifre en az 6 karakter olmalı.');
        setSaving(false);
        return;
      }
      next.password = hashPassword(draft.password);
    } else if (draft.password.trim()) {
      if (draft.password.trim().length < 6) {
        setNotice('Yeni şifre en az 6 karakter olmalı.');
        setSaving(false);
        return;
      }
      next.password = hashPassword(draft.password);
    }

    const res = await membership.adminUpsertMember(next);
    setSaving(false);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setDraft(null);
    setNotice(draft.isNew ? `${email} oluşturuldu.` : `${email} güncellendi.`);
    void load(true);
  };

  const setPlan = async (m: MemberDoc, plan: VipPlanId) => {
    setNotice(null);
    const res = await membership.adminSetVip(m.id, plan);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setMembers(list =>
      list.map(item =>
        item.id === m.id
          ? {
              ...item,
              vip: plan !== 'free',
              vipPlan: plan,
              vipExpiresAt: plan === 'lifetime' || plan === 'free' ? '' : expiryFromToday(plan),
            }
          : item
      )
    );
  };

  const setStatus = async (m: MemberDoc, status: MembershipStatus) => {
    setNotice(null);
    const res = await membership.adminSetStatus(m.id, status);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setMembers(list => list.map(item => (item.id === m.id ? { ...item, status } : item)));
  };

  const removeMember = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setNotice(null);
    const res = await membership.adminDeleteMember(id);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    setMembers(list => list.filter(m => m.id !== id));
    setNotice(`${id} silindi.`);
  };

  const restore = async () => {
    setRestoreBusy(true);
    const res = await membership.restoreFromCloud();
    setRestoreBusy(false);
    setNotice(
      res.ok
        ? `${res.restored} test kaydı cihazdaki üyelik belgesinden geri yüklendi.`
        : res.reason ?? 'Geri yükleme yapılamadı.'
    );
  };

  return (
    <AdminScaffold
      title="Üyelikler"
      subtitle={`${members.length} Firestore kaydı • ${vipCount} VIP • ${policy.enforce ? `her ders ${policy.freeTestsPerCourse} test` : 'limit kapalı'}`}
      icon="person-badge-outline"
      right={
        <AdminChip
          label={loading ? 'Yenileniyor' : 'Yenile'}
          icon="refresh"
          compact
          tone={membership.cloudStatus === 'denied' ? 'danger' : 'default'}
          onPress={() => void load()}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <CloudStatusBanner />

        {notice ? (
          <AdminCard pad={10} style={{ marginBottom: 12 }}>
            <Text style={[styles.notice, { color: colors.textSecondary }]}>{notice}</Text>
          </AdminCard>
        ) : null}

        <View style={styles.statsRow}>
          <AdminStat label="Üye" value={String(members.length)} icon="people-outline" />
          <AdminStat
            label="VIP"
            value={String(vipCount)}
            icon="diamond-outline"
            tone="warning"
          />
          <AdminStat
            label="Onay"
            value={String(pendingCount)}
            icon="hourglass-outline"
            tone={pendingCount > 0 ? 'info' : 'default'}
          />
          <AdminStat label="Test" value={String(testsToday)} icon="document-text-outline" />
        </View>

        <AdminSectionTitle
          label="Üyelik politikası"
          hint="Tüm ekranlar bu kuralları okur"
        />
        <AdminCard style={{ marginBottom: 12 }}>
          <AdminToggle
            label="Test limiti uygulansın"
            description="Kapatınca üye olmayanlar da sınırsız çözer (yanlış bir rules dağıtımında panik butonu)."
            value={policy.enforce}
            onValueChange={v => patchPolicy({ enforce: v })}
            icon="shield-checkmark-outline"
          />
          <View style={styles.divider} />
          <View style={styles.policyRow}>
            <Text style={[styles.policyLabel, { color: colors.textSecondary }]}>
              Ücretsiz test / ders
            </Text>
            <View style={styles.policyStepper}>
              <AdminIconButton
                icon="remove-circle-outline"
                size={20}
                onPress={() =>
                  patchPolicy({
                    freeTestsPerCourse: Math.max(0, policy.freeTestsPerCourse - 1),
                  })
                }
              />
              <Text style={[styles.policyValue, { color: colors.text }]}>
                {policy.freeTestsPerCourse}
              </Text>
              <AdminIconButton
                icon="add-circle-outline"
                size={20}
                onPress={() =>
                  patchPolicy({ freeTestsPerCourse: Math.min(20, policy.freeTestsPerCourse + 1) })
                }
              />
            </View>
          </View>
          <View style={styles.divider} />
          <AdminToggle
            label="Yeni kayıtlar onay beklesin"
            description="Açıkken kaydolunca durum `pending` olur; VIP verilene kadar üye onaylanmaz."
            value={policy.requireApproval}
            onValueChange={v => patchPolicy({ requireApproval: v })}
            icon="hourglass-outline"
          />
          <View style={styles.divider} />
          <AdminToggle
            label="VIP Firestore’dan okunsun"
            description="Kapatınca yalnızca bu cihazın yerel VIP etiketi geçerli olur (test amaçlı)."
            value={policy.cloudVip}
            onValueChange={v => patchPolicy({ cloudVip: v })}
            icon="cloud-outline"
          />
          <View style={styles.divider} />
          <AdminToggle
            label="Panel listesi Firestore’u göstersin"
            description="Açıkken kullanıcı listesi demo kayıtlar yerine gerçek üyelik belgeleriyle doldurulur."
            value={policy.cloudMembers}
            onValueChange={v => patchPolicy({ cloudMembers: v })}
            icon="list-outline"
          />
          <View style={styles.divider} />
          <View style={styles.policyRow}>
            <Text style={[styles.policyLabel, { color: colors.textSecondary }]}>
              Deneme VIP (gün)
            </Text>
            <View style={styles.policyStepper}>
              <AdminIconButton
                icon="remove-circle-outline"
                size={20}
                onPress={() =>
                  patchPolicy({ defaultTrialDays: Math.max(0, policy.defaultTrialDays - 1) })
                }
              />
              <Text style={[styles.policyValue, { color: colors.text }]}>
                {policy.defaultTrialDays}
              </Text>
              <AdminIconButton
                icon="add-circle-outline"
                size={20}
                onPress={() =>
                  patchPolicy({ defaultTrialDays: Math.min(90, policy.defaultTrialDays + 1) })
                }
              />
            </View>
          </View>
        </AdminCard>

        <AdminSectionTitle
          label={`Kayıtlar (${visible.length})`}
          action={
            <AdminButton
              small
              icon="person-add-outline"
              label="Yeni üye"
              onPress={() => setDraft({ ...blankDraft })}
            />
          }
        />

        <AdminSearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Ad, e-posta, şehir ara"
        />
        <AdminSegmented
          options={FILTERS.map(f => ({ id: f.id, label: f.label }))}
          value={filter}
          onChange={id => setFilter(id as FilterId)}
        />

        {loading && members.length === 0 ? (
          <AdminSpinner label="Firestore’dan üyelikler okunuyor…" />
        ) : visible.length === 0 ? (
          <AdminEmpty
            icon="person-badge-outline"
            title={members.length === 0 ? 'Henüz üyelik yok' : 'Filtreyle eşleşen kayıt yok'}
            hint={
              members.length === 0
                ? '“Yeni üye” ile oluştur veya kaydolmasını bekle. Kayıtlar `memberships` koleksiyonuna yazılır.'
                : 'Aramayı temizleyip tekrar dene.'
            }
          />
        ) : (
          <View style={{ marginTop: 10 }}>
            {visible.map(m => {
              const vip = isVipActive(m);
              const left = daysLeft(m.vipExpiresAt);
              const used = Object.values(m.courseUsage ?? {}).reduce((a, b) => a + b, 0);
              return (
                <AdminCard key={m.id} pad={12} style={{ marginBottom: 10 }}>
                  <View style={styles.headRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]}>
                        {m.displayName || m.email}
                      </Text>
                      <Text style={[styles.email, { color: colors.textMuted }]} numberOfLines={1}>
                        {m.email || m.id}
                      </Text>
                    </View>
                    <View style={styles.headChips}>
                      <AdminChip
                        label={STATUS_LABEL[m.status]}
                        tone={STATUS_TONE[m.status]}
                        compact
                      />
                      <AdminChip
                        label={PLAN_LABEL[vip ? m.vipPlan : 'free']}
                        tone={vip ? 'warning' : 'default'}
                        icon={vip ? 'diamond' : undefined}
                        compact
                      />
                    </View>
                  </View>

                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {used} test • {(m.questionsSolved ?? 0).toLocaleString('tr-TR')} soru
                    {m.city ? ` • ${m.city}` : ''}
                    {m.lastLoginAt ? ` • son ${m.lastLoginAt.slice(0, 10)}` : ''}
                    {vip && left !== null
                      ? left < 0
                        ? ` • ${Math.abs(left)} gün önce bitti`
                        : ` • ${left} gün kaldı`
                      : ''}
                    {m.pendingSync ? ' • yazım bekliyor' : ''}
                  </Text>

                  {m.note ? (
                    <Text style={[styles.note, { color: colors.textMuted }]} numberOfLines={2}>
                      “{m.note}”
                    </Text>
                  ) : null}

                  <View style={styles.planRow}>
                    {(['free', 'monthly', 'yearly', 'lifetime'] as VipPlanId[]).map(plan => (
                      <AdminChip
                        key={plan}
                        label={PLAN_LABEL[plan]}
                        active={m.vipPlan === plan}
                        compact
                        onPress={() => void setPlan(m, plan)}
                      />
                    ))}
                  </View>

                  <View style={styles.actions}>
                    <AdminButton
                      small
                      tone="ghost"
                      flex
                      icon="create-outline"
                      label="Düzenle"
                      onPress={() => openEdit(m)}
                    />
                    <AdminButton
                      small
                      tone={m.status === 'active' ? 'danger' : 'success'}
                      flex
                      icon={m.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'}
                      label={m.status === 'active' ? 'Dondur' : 'Aktifleştir'}
                      onPress={() => void setStatus(m, m.status === 'active' ? 'suspended' : 'active')}
                    />
                    {m.status === 'pending' ? (
                      <AdminButton
                        small
                        tone="success"
                        flex
                        icon="shield-checkmark-outline"
                        label="Onayla"
                        onPress={() => void setStatus(m, 'active')}
                      />
                    ) : null}
                    <AdminButton
                      small
                      tone="danger"
                      flex
                      icon="trash-outline"
                      label="Sil"
                      onPress={() => setConfirmDelete(m)}
                    />
                  </View>
                </AdminCard>
              );
            })}
          </View>
        )}

        <AdminSectionTitle label="Cihaz eşitleme" hint="Bu cihaz ile bulut belgesi" />
        <AdminCard style={{ marginBottom: 16 }}>
          <AdminRow
            icon="cloud-download-outline"
            title="Verileri buluttan geri yükle"
            subtitle="Cihaz sıfırlanmışsa bile hakkı kalan testleri geri getirir, limiti yeniden kurar."
            right={
              <AdminButton
                small
                label={restoreBusy ? 'Çalışıyor' : 'Geri yükle'}
                disabled={restoreBusy || !membership.signedIn}
                onPress={() => void restore()}
              />
            }
          />
          <View style={styles.divider} />
          <AdminRow
            icon="cloud-upload-outline"
            title="Kullanımı buluta yaz"
            subtitle="Cihazda çözülen testleri üyelik belgesindeki sayaçlara işler."
            right={
              <AdminButton
                small
                label="Senkronla"
                disabled={!membership.signedIn}
                onPress={() => {
                  const usage = membership.localUsageSnapshot();
                  void membership.syncUsageToCloud(usage).then(res => {
                    setNotice(res.ok ? 'Kullanım buluta yazıldı.' : res.reason ?? 'Yazılamadı.');
                  });
                }}
              />
            }
          />
        </AdminCard>
      </ScrollView>

      <AdminSheet
        visible={!!draft}
        title={draft?.isNew ? 'Yeni üye oluştur' : 'Üyeliği düzenle'}
        onClose={() => setDraft(null)}
        footer={
          <View style={styles.sheetFooter}>
            <AdminButton label="Vazgeç" tone="ghost" flex onPress={() => setDraft(null)} />
            <AdminButton
              label={saving ? 'Kaydediliyor…' : 'Firestore’a yaz'}
              icon="cloud-upload-outline"
              flex
              disabled={saving || !draft}
              onPress={() => void saveDraft()}
            />
          </View>
        }
      >
        {draft ? (
          <View style={{ gap: 10 }}>
            <AdminField
              label="E-posta"
              value={draft.email}
              onChangeText={t => setDraft({ ...draft, email: t })}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="ogrenci@ornek.com"
              hint={
                draft.isNew
                  ? 'Belge kimliği budur: memberships/' + (normalizeEmail(draft.email) || '…')
                  : 'Değiştirmeyin — kimlik, belge adıyla eşleşmek zorunda.'
              }
            />
            <AdminField
              label="Ad soyad"
              value={draft.displayName}
              onChangeText={t => setDraft({ ...draft, displayName: t })}
              placeholder="Ayşe Yılmaz"
            />
            <AdminField
              label={draft.isNew ? 'Şifre' : 'Şifreyi değiştir (boşsa dokunma)'}
              value={draft.password}
              onChangeText={t => setDraft({ ...draft, password: t })}
              autoCapitalize="none"
              placeholder="en az 6 karakter"
              hint="Cihazda PBKDF2-SHA256 ile hash’lenir; düz metin Firestore’a gitmez."
            />
            <AdminSegmented
              label="Plan"
              options={(['free', 'monthly', 'yearly', 'lifetime'] as VipPlanId[]).map(p => ({
                id: p,
                label: PLAN_LABEL[p],
              }))}
              value={draft.plan}
              onChange={id => setDraft({ ...draft, plan: id as VipPlanId })}
            />
            <AdminSegmented
              label="Durum"
              options={(
                ['active', 'pending', 'suspended', 'banned'] as MembershipStatus[]
              ).map(s => ({ id: s, label: STATUS_LABEL[s] }))}
              value={draft.status}
              onChange={id => setDraft({ ...draft, status: id as MembershipStatus })}
            />
            <AdminSegmented
              label="Rol"
              options={[
                { id: 'user', label: 'Üye' },
                { id: 'editor', label: 'Editör' },
                { id: 'admin', label: 'Yönetici' },
              ]}
              value={draft.role}
              onChange={id => setDraft({ ...draft, role: id as MemberRole })}
            />
            <AdminField
              label="Şehir"
              value={draft.city}
              onChangeText={t => setDraft({ ...draft, city: t })}
              placeholder="Elazığ"
            />
            <AdminField
              label="Sınav"
              value={draft.exam}
              onChangeText={t => setDraft({ ...draft, exam: t })}
            />
            <AdminField
              label="Not"
              value={draft.note}
              onChangeText={t => setDraft({ ...draft, note: t })}
              multiline
              placeholder="Ödeme alındı, iptal talebi var…"
            />
          </View>
        ) : null}
      </AdminSheet>

      <AdminConfirm
        visible={!!confirmDelete}
        title="Üyeliği sil"
        message={`${confirmDelete?.email ?? ''} belgesi Firestore’dan kalıcı olarak silinecek. Test geçmişi cihazda kalır.`}
        confirmLabel="Sil"
        onConfirm={() => void removeMember()}
        onCancel={() => setConfirmDelete(null)}
      />
    </AdminScaffold>
  );
};

/** Preserve the current end-date when re-applying the same plan, else compute a fresh one. */
function planExpiry(plan: VipPlanId, current: string | undefined): string {
  if (plan === 'free' || plan === 'lifetime') return '';
  return expiryFromToday(plan, current);
}

function expiryFromToday(plan: VipPlanId, current?: string): string {
  const days = plan === 'yearly' ? 365 : 30;
  const from = current && daysLeft(current) !== null && daysLeft(current)! > 0 ? new Date(current) : new Date();
  return new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  scroll: { padding: 14, paddingBottom: 40 },
  notice: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  divider: { height: 1, marginVertical: 8, opacity: 0.5 },
  policyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  policyLabel: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  policyStepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  policyValue: { minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: '900' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headChips: { alignItems: 'flex-end', gap: 4 },
  name: { fontSize: 14.5, fontWeight: '900' },
  email: { fontSize: 11.5, marginTop: 2 },
  meta: { fontSize: 11.5, marginTop: 6, fontWeight: '600' },
  note: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  planRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  sheetFooter: { flexDirection: 'row', gap: 8 },
});

export default AdminMembershipScreen;
