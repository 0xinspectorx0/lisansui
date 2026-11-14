import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { AdminRole, AdminUser, UserStatus, VipPlan } from '../lib/adminStore';
import { useMembership } from '../lib/MembershipContext';
import { normalizeEmail, type MemberDoc } from '../lib/membership';
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
  AdminStepper,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

type FilterId = 'all' | 'pending' | 'vip' | 'free' | 'blocked' | 'expiring';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'pending', label: 'Onay bekleyen' },
  { id: 'vip', label: 'VIP' },
  { id: 'free', label: 'Ücretsiz' },
  { id: 'expiring', label: 'Süresi doluyor' },
  { id: 'blocked', label: 'Kısıtlı' },
];

const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Kurucu',
  admin: 'Yönetici',
  editor: 'Editör',
  user: 'Kullanıcı',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Aktif',
  pending: 'Onay bekliyor',
  suspended: 'Askıda',
  banned: 'Yasaklı',
};

const PLAN_LABEL: Record<VipPlan, string> = {
  free: 'Ücretsiz',
  monthly: 'Aylık',
  yearly: 'Yıllık',
  lifetime: 'Omr boyu',
};

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

const emptyUser = (): AdminUser => ({
  id: `u_${Date.now().toString(36)}`,
  name: '',
  email: '',
  role: 'user',
  status: 'active',
  vip: false,
  vipPlan: 'free',
  vipExpiresAt: null,
  joinedAt: new Date().toISOString().slice(0, 10),
  lastActiveAt: new Date().toISOString().slice(0, 10),
  solved: 0,
  net: 0,
  streak: 0,
  exam: 'KPSS Lisans (GY-GK)',
  city: '',
  note: '',
});

/** Maps an edited panel row back onto its Supabase member document. */
function memberFromRow(row: AdminUser, doc: MemberDoc): MemberDoc {
  return {
    ...doc,
    email: row.email || doc.email,
    emailNormalized: normalizeEmail(row.email || doc.email),
    displayName: row.name,
    role:
      row.role === 'owner' || row.role === 'admin'
        ? 'admin'
        : row.role === 'editor'
        ? 'editor'
        : 'user',
    status:
      row.status === 'active'
        ? 'active'
        : row.status === 'pending'
        ? 'pending'
        : row.status === 'banned'
        ? 'banned'
        : 'suspended',
    city: row.city,
    exam: row.exam,
    note: row.note,
    vip: row.vip,
    vipPlan: row.vipPlan,
    vipExpiresAt: row.vipExpiresAt ?? '',
    testsCompleted: row.testsCompleted ?? doc.testsCompleted,
    questionsSolved: row.questionsSolved ?? doc.questionsSolved,
  };
}

export const AdminUsersScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const admin = useAdmin();
  const membership = useMembership();
  const { users, settings, isVip, localUser } = admin;

  const [vipDays, setVipDays] = useState(30);

  useEffect(() => {
    void membership.adminListMembers();
  }, [membership.membersVersion]);

  /** Supabase is the source of truth: a row that mirrors a member document is
   *  written back to `memberships/{id}` instead of only living in the panel. */
  const cloudError = (message: string) => {
    Alert.alert('Supabase yazılamadı', message);
  };

  const setVipFor = useCallback(
    async (row: AdminUser, enable: boolean, plan: VipPlan = 'monthly', days = 30) => {
      if (row.remoteId) {
        const res = await membership.adminSetVip(row.remoteId, enable ? plan : 'free');
        if (!res.ok) cloudError(res.error);
        return;
      }
      if (enable) admin.grantVip(row.id, plan, days);
      else admin.revokeVip(row.id);
    },
    [admin, membership]
  );

  const setStatusFor = useCallback(
    async (row: AdminUser, status: UserStatus) => {
      if (row.remoteId) {
        const res = await membership.adminSetStatus(
          row.remoteId,
          status === 'active'
            ? 'active'
            : status === 'pending'
            ? 'pending'
            : status === 'banned'
            ? 'banned'
            : 'suspended'
        );
        if (!res.ok) cloudError(res.error);
        return;
      }
      admin.setUserStatus(row.id, status);
    },
    [admin, membership]
  );

  const bulkVipFor = useCallback(
    async (ids: string[], enable: boolean) => {
      const rows = users.filter(u => ids.includes(u.id));
      const local = rows.filter(r => !r.remoteId);
      if (local.length) {
        admin.bulkVip(
          local.map(r => r.id),
          enable,
          enable ? (vipDays >= 365 ? 'yearly' : 'monthly') : 'free',
          vipDays
        );
      }
      for (const row of rows.filter(r => r.remoteId)) {
        const res = await membership.adminSetVip(
          row.remoteId!,
          enable ? (vipDays >= 365 ? 'yearly' : 'monthly') : 'free'
        );
        if (!res.ok) cloudError(res.error);
      }
      setSelected({});
    },
    [admin, membership, users, vipDays]
  );

  /**
   * Rol değişimi de ANINDA buluta gider: BULUT satırında `members.role` PATCH'lenir,
   * yalnız-ca-cihaz satırlarında yerel liste güncellenir. Red durumunda işlem
   * yapılmış sayılmaz ve panel nedeni gösterir.
   */
  const setRoleFor = useCallback(
    async (row: AdminUser) => {
      const next = row.role === 'user' ? 'editor' : 'user';
      if (row.remoteId) {
        const res = await membership.adminSetRole(row.remoteId, next === 'editor' ? 'admin' : 'user');
        if (!res.ok) {
          cloudError(res.error);
          return;
        }
      }
      admin.setUserRole(row.id, next);
    },
    [admin, membership]
  );

  const deleteFor = useCallback(
    async (row: AdminUser) => {
      if (row.remoteId) {
        const res = await membership.adminDeleteMember(row.remoteId);
        if (!res.ok) {
          cloudError(res.error);
          return;
        }
      }
      admin.deleteUser(row.id);
    },
    [admin, membership]
  );

  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: AdminUser } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return users
      .filter(u => {
        if (filter === 'pending' && u.status !== 'pending') return false;
        if (filter === 'vip' && !u.vip) return false;
        if (filter === 'free' && u.vip) return false;
        if (filter === 'blocked' && (u.status === 'active' || u.status === 'pending')) return false;
        if (filter === 'expiring') {
          const d = daysLeft(u.vipExpiresAt);
          if (!u.vip || d === null || d < 0 || d > 7) return false;
        }
        if (!q) return true;
        return (
          u.name.toLocaleLowerCase('tr-TR').includes(q) ||
          u.email.toLocaleLowerCase('tr-TR').includes(q) ||
          u.city.toLocaleLowerCase('tr-TR').includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [users, filter, search]);

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const vipCount = users.filter(u => u.vip).length;

  const saveUser = async () => {
    if (!editor) return;
    const draft = editor.draft;
    if (!draft.name.trim()) return;
    const next = { ...draft, name: draft.name.trim(), email: draft.email.trim() };

    // Cloud rows must be written back to their Supabase document first;
    // the panel row is only updated when the write succeeded.
    if (next.remoteId) {
      const { members } = await membership.adminListMembers();
      const doc = members.find(m => m.id === next.remoteId);
      if (!doc) {
        Alert.alert(
          'Üye bulunamadı',
          'Bu satırın Supabase belgesi okunamadı. Listeyi yenileyip tekrar dene.'
        );
        return;
      }
      const res = await membership.adminUpsertMember(memberFromRow(next, doc));
      if (!res.ok) {
        cloudError(res.error);
        return;
      }
    }
    admin.upsertUser(next);
    setEditor(null);
  };

  return (
    <AdminScaffold
      title="Kullanıcılar & VIP"
      subtitle={`${users.length} kayıt • ${vipCount} VIP • ${
        settings.vipGates.karmaExam || settings.vipGates.tips || settings.vipGates.review || settings.vipGates.focus
          ? 'VIP kapıları aktif'
          : 'VIP kapıları kapalı'
      }`}
      icon="people-outline"
      right={
        <AdminChip
          label={isVip ? 'Cihaz VIP' : 'Cihaz ücretsiz'}
          tone={isVip ? 'warning' : 'default'}
          icon="diamond-outline"
          compact
          onPress={() => admin.toggleVip(localUser.id)}
        />
      }
    >
      <AdminGate>
        <AdminSearchBar value={search} onChangeText={setSearch} placeholder="İsim, e-posta, şehir ara" />

        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <AdminChip
              key={f.id}
              label={f.label}
              active={filter === f.id}
              compact
              onPress={() => setFilter(f.id)}
            />
          ))}
        </View>

        <AdminSectionTitle
          label="Toplu işlemler"
          hint="Satırlardaki daireye dokunarak seç; toplu VIP aç/kapat, erişim değiştir."
        />
        <View style={styles.bulkRow}>
          <AdminButton
            small
            tone="ghost"
            icon="diamond-outline"
            label={`${selectedIds.length || 0} seçili`}
            onPress={() =>
              setSelected(prev => {
                const all = list.every(u => prev[u.id]);
                if (all) return {};
                const next: Record<string, boolean> = {};
                list.forEach(u => (next[u.id] = true));
                return next;
              })
            }
          />
          <AdminButton
            small
            tone="success"
            icon="diamond"
            label="VIP aç"
            disabled={selectedIds.length === 0}
            onPress={() => void bulkVipFor(selectedIds, true)}
          />
          <AdminButton
            small
            tone="danger"
            icon="diamond-outline"
            label="VIP kapat"
            disabled={selectedIds.length === 0}
            onPress={() => void bulkVipFor(selectedIds, false)}
          />
        </View>
        <AdminCard pad={10} style={{ marginBottom: 12 }}>
          <AdminStepper
            label="Toplu VIP süresi"
            description="Gün cinsinden; 365 ve üzeri “Yıllık” olarak işaretlenir."
            value={vipDays}
            min={1}
            max={720}
            step={5}
            onChange={setVipDays}
            suffix="gün"
          />
        </AdminCard>

        {list.length === 0 ? (
          <AdminCard>
            <AdminEmpty icon="person-search-outline" title="Kayıt bulunamadı" hint="Filtreyi veya aramayı değiştir." />
          </AdminCard>
        ) : (
          <AdminCard pad={4}>
            {list.map(u => {
              const selectedHere = !!selected[u.id];
              return (
                <View
                  key={u.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Pressable
                    onPress={() => setSelected(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                    hitSlop={8}
                    style={[
                      styles.selectBox,
                      {
                        borderColor: selectedHere ? colors.primary : colors.borderStrong,
                        backgroundColor: selectedHere ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {selectedHere && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <AdminRow
                      compact
                      icon={u.isLocal ? 'phone-portrait-outline' : 'person-circle-outline'}
                      title={u.name || '(isimsiz)'}
                      subtitle={`${u.email || '—'} • ${u.city || '—'} • ${u.solved.toLocaleString(
                        'tr-TR'
                      )} soru • net ${u.net} • ${u.streak} gün seri`}
                      badge={
                        u.status === 'pending'
                          ? 'ONAY BEKLİYOR'
                          : u.isLocal
                          ? 'BU CİHAZ'
                          : u.remoteId
                          ? 'BULUT'
                          : undefined
                      }
                      onPress={() => setEditor({ mode: 'edit', draft: { ...u } })}
                      right={
                        u.status === 'pending' ? (
                          <AdminButton
                            small
                            tone="success"
                            icon="checkmark-circle-outline"
                            label="Onayla"
                            onPress={() => void setStatusFor(u, 'active')}
                          />
                        ) : (
                          <RightChevron />
                        )
                      }
                    />
                  </View>
                </View>
              );
            })}
          </AdminCard>
        )}

        {/* Per-user quick controls */}
        <AdminSectionTitle label="Hızlı erişim kontrolleri" hint="VIP, rol ve engel durumlarını tek dokunuşla değiştir" />
        <AdminCard pad={10}>
          {list.slice(0, 8).map((u, idx, arr) => {
            const left = daysLeft(u.vipExpiresAt);
            return (
              <View
                key={u.id}
                style={[
                  styles.quickRow,
                  idx < arr.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                    {u.name}
                  </Text>
                  <View style={styles.tagRow}>
                    <AdminChip
                      label={u.vip ? PLAN_LABEL[u.vipPlan] : 'Ücretsiz'}
                      tone={u.vip ? 'warning' : 'default'}
                      compact
                    />
                    <AdminChip
                      label={ROLE_LABEL[u.role]}
                      tone={u.role === 'user' ? 'default' : 'info'}
                      compact
                    />
                    {u.status !== 'active' && (
                      <AdminChip label={STATUS_LABEL[u.status]} tone="danger" compact />
                    )}
                    {left !== null && (
                      <AdminChip
                        label={left < 0 ? `${Math.abs(left)} gün geçti` : `${left} gün`}
                        tone={left < 0 ? 'danger' : left <= 7 ? 'warning' : 'success'}
                        compact
                      />
                    )}
                  </View>
                </View>
                <View style={styles.quickActions}>
                  <AdminIconButton
                    icon={u.vip ? 'diamond' : 'diamond-outline'}
                    color={u.vip ? colors.warning : colors.textMuted}
                    size={17}
                    onPress={() => void setVipFor(u, !u.vip, u.vip ? 'free' : 'monthly', vipDays)}
                  />
                  <AdminIconButton
                    icon={u.role === 'user' ? 'shield-checkmark-outline' : 'person-outline'}
                    size={17}
                    onPress={() => void setRoleFor(u)}
                  />
                  <AdminIconButton
                    icon={u.status === 'active' ? 'ban-outline' : 'checkmark-circle-outline'}
                    color={u.status === 'active' ? colors.danger : colors.success}
                    size={17}
                    onPress={() =>
                      void setStatusFor(u, u.status === 'active' ? 'suspended' : 'active')
                    }
                  />
                  <AdminIconButton
                    icon="trash-outline"
                    color={colors.danger}
                    size={17}
                    disabled={u.isLocal}
                    onPress={() => setConfirmDelete(u)}
                  />
                </View>
              </View>
            );
          })}
        </AdminCard>

        <View style={styles.footer}>
          <AdminButton
            label="Yeni kullanıcı ekle"
            icon="person-add-outline"
            onPress={() => setEditor({ mode: 'add', draft: emptyUser() })}
            flex
          />
          <AdminButton
            label="VIP kapıları"
            tone="ghost"
            icon="lock-closed-outline"
            onPress={() => navigation.navigate('AdminSettings')}
            flex
          />
        </View>
      </AdminGate>

      {/* Editor */}
      <AdminSheet
        visible={!!editor}
        title={editor?.mode === 'add' ? 'Yeni kullanıcı' : 'Kullanıcıyı düzenle'}
        onClose={() => setEditor(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setEditor(null)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              onPress={saveUser}
              disabled={!editor?.draft.name.trim()}
              flex
            />
          </>
        }
      >
        {editor && (
          <>
            <AdminField
              label="Ad soyad"
              value={editor.draft.name}
              onChangeText={t => patchDraft(setEditor, { name: t })}
              placeholder="Örn: Elif Yıldırım"
            />
            <AdminField
              label="E-posta"
              value={editor.draft.email}
              onChangeText={t => patchDraft(setEditor, { email: t })}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="ornek@eposta.com"
            />
            <AdminField
              label="Şehir"
              value={editor.draft.city}
              onChangeText={t => patchDraft(setEditor, { city: t })}
              placeholder="Örn: Elazığ"
            />
            <AdminField
              label="Hazırlandığı sınav"
              value={editor.draft.exam}
              onChangeText={t => patchDraft(setEditor, { exam: t })}
            />

            <AdminSegmented
              label="Rol"
              value={editor.draft.role}
              onChange={id => patchDraft(setEditor, { role: id as AdminRole })}
              options={[
                { id: 'user', label: 'Kullanıcı' },
                { id: 'editor', label: 'Editör' },
                { id: 'admin', label: 'Yönetici' },
                { id: 'owner', label: 'Kurucu' },
              ]}
            />
            <AdminSegmented
              label="Erişim durumu"
              value={editor.draft.status}
              onChange={id => patchDraft(setEditor, { status: id as UserStatus })}
              options={[
                { id: 'active', label: 'Aktif' },
                { id: 'suspended', label: 'Askıda' },
                { id: 'banned', label: 'Yasaklı' },
              ]}
            />
            <AdminSegmented
              label="VIP paketi"
              value={editor.draft.vipPlan}
              onChange={id => {
                const plan = id as VipPlan;
                patchDraft(setEditor, {
                  vipPlan: plan,
                  vip: plan !== 'free',
                  vipExpiresAt:
                    plan === 'lifetime' || plan === 'free'
                      ? null
                      : plan === 'monthly'
                      ? addDays(30)
                      : addDays(365),
                });
              }}
              options={[
                { id: 'free', label: 'Ücretsiz' },
                { id: 'monthly', label: 'Aylık' },
                { id: 'yearly', label: 'Yıllık' },
                { id: 'lifetime', label: 'Omur boyu' },
              ]}
            />
            <AdminField
              label="VIP bitiş tarihi"
              value={editor.draft.vipExpiresAt || ''}
              onChangeText={t => patchDraft(setEditor, { vipExpiresAt: t || null })}
              placeholder="yyyy-aa-gg (boş = süresiz)"
              hint={
                editor.draft.vipExpiresAt
                  ? daysLeft(editor.draft.vipExpiresAt)! >= 0
                    ? `${daysLeft(editor.draft.vipExpiresAt)} gün kaldı`
                    : `Süresi ${Math.abs(daysLeft(editor.draft.vipExpiresAt)!)} gün önce doldu`
                  : 'Süresiz VIP'
              }
            />
            <AdminField
              label="Not"
              value={editor.draft.note}
              onChangeText={t => patchDraft(setEditor, { note: t })}
              multiline
              placeholder="Kullanıcı hakkında iç not"
            />
            <View style={styles.statsRow}>
              <AdminStepper
                label="Çözülen soru"
                value={editor.draft.solved}
                min={0}
                max={200000}
                step={10}
                onChange={v => patchDraft(setEditor, { solved: v })}
              />
              <AdminStepper
                label="Net"
                value={editor.draft.net}
                min={0}
                max={200}
                step={0.5}
                onChange={v => patchDraft(setEditor, { net: v })}
              />
              <AdminStepper
                label="Seri"
                value={editor.draft.streak}
                min={0}
                max={999}
                onChange={v => patchDraft(setEditor, { streak: v })}
                suffix="gün"
              />
            </View>
            <View style={styles.sheetActions}>
              <AdminButton
                small
                tone={editor.draft.vip ? 'danger' : 'success'}
                icon="diamond-outline"
                label={editor.draft.vip ? 'VIP’i kaldır' : `${settings.vipTrialDays} gün deneme ver`}
                onPress={() =>
                  editor.draft.vip
                    ? patchDraft(setEditor, { vip: false, vipPlan: 'free', vipExpiresAt: null })
                    : patchDraft(setEditor, {
                        vip: true,
                        vipPlan: 'monthly',
                        vipExpiresAt: addDays(settings.vipTrialDays),
                      })
                }
                flex
              />
              <AdminButton
                small
                tone="neutral"
                icon="swap-horizontal-outline"
                label={editor.draft.status === 'active' ? 'Hesabı askıya al' : 'Aktifleştir'}
                onPress={() =>
                  patchDraft(setEditor, {
                    status: editor.draft.status === 'active' ? 'suspended' : 'active',
                  })
                }
                flex
              />
            </View>
          </>
        )}
      </AdminSheet>

      <AdminConfirm
        visible={!!confirmDelete}
        title="Kullanıcıyı sil"
        message={`${confirmDelete?.name || ''} kaydı yönetim listesinden silinecek.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void deleteFor(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </AdminScaffold>
  );
};

const RightChevron: React.FC = () => {
  const { colors } = useAppTheme();
  return <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />;
};

function addDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function patchDraft(
  setEditor: React.Dispatch<React.SetStateAction<{ mode: 'add' | 'edit'; draft: AdminUser } | null>>,
  patch: Partial<AdminUser>
) {
  setEditor(prev => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectBox: {
    width: 20,
    height: 20,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  quickActions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  statsRow: { gap: 0, marginTop: 4 },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
});
