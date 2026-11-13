import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '../lib/theme';
import { useApp } from '../lib/AppContext';
import { useAdmin } from '../lib/AdminContext';
import { ALL_COURSE_IDS } from '../lib/adminStore';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminRow,
  AdminScaffold,
  AdminSectionTitle,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';

const SHORTCUTS: {
  id: string;
  label: string;
  desc: string;
  icon: string;
  route: string;
}[] = [
  {
    id: 'topics',
    label: 'Konular & Katalog',
    desc: 'Ekle, yeniden adlandır, sil, sırala',
    icon: 'albums-outline',
    route: 'AdminTopics',
  },
  {
    id: 'questions',
    label: 'Soru Havuzu',
    desc: 'Soru düzenle, ekle, sil, sıra değiştir',
    icon: 'help-circle-outline',
    route: 'AdminQuestions',
  },
  {
    id: 'users',
    label: 'Kullanıcılar & VIP',
    desc: 'VIP ver/kaldır, rol, erişim durumu',
    icon: 'people-outline',
    route: 'AdminUsers',
  },
  {
    id: 'membership',
    label: 'Üyelik Paneli',
    desc: 'Firestore üyeleri, plan/durum, test limiti',
    icon: 'person-badge-outline',
    route: 'AdminMembership',
  },
  {
    id: 'tips',
    label: 'Hap Bilgiler',
    desc: 'Listeyi düzenle ve sırala',
    icon: 'bulb-outline',
    route: 'AdminTips',
  },
  {
    id: 'courses',
    label: 'Dersler',
    desc: 'Ana ekran sırası, görünürlük, başlık',
    icon: 'grid-outline',
    route: 'AdminCourses',
  },
  {
    id: 'settings',
    label: 'Uygulama Ayarları',
    desc: 'Duyuru, bakım, VIP kapıları, PIN',
    icon: 'settings-outline',
    route: 'AdminSettings',
  },
];

export const AdminPanelScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { catalog, results, mistakes, favorites, streak, todayStats, refreshAllCourses } =
    useApp();
  const admin = useAdmin();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const {
    users,
    activity,
    overrides,
    isVip,
    localUser,
    lock,
    announcement,
    maintenanceActive,
  } = admin;

  const stats = useMemo(() => {
    const topicCount = ALL_COURSE_IDS.reduce((sum, id) => sum + (catalog[id]?.length || 0), 0);
    const questionCount = ALL_COURSE_IDS.reduce(
      (sum, id) => sum + (catalog[id] || []).reduce((s, t) => s + (t.questionCount || 0), 0),
      0
    );
    return {
      topicCount,
      questionCount,
      vipCount: users.filter(u => u.vip).length,
      blockedCount: users.filter(u => u.status !== 'active').length,
      expiringSoon: users.filter(u => {
        if (!u.vip || !u.vipExpiresAt) return false;
        const days = Math.ceil((new Date(u.vipExpiresAt).getTime() - Date.now()) / 86400000);
        return days <= 7;
      }).length,
    };
  }, [catalog, users]);

  return (
    <AdminScaffold
      title="Yönetim Paneli"
      subtitle={`${stats.questionCount.toLocaleString('tr-TR')} soru • ${users.length} kullanıcı`}
      icon="shield-checkmark-outline"
      right={
        admin.unlocked ? (
          <Pressable
            onPress={lock}
            hitSlop={8}
            style={[
              styles.lockBtn,
              { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null
      }
    >
      <AdminGate>
        <View style={styles.statusRow}>
          <AdminChip
            label={maintenanceActive ? 'Bakım modu açık' : 'Yayın normal'}
            tone={maintenanceActive ? 'danger' : 'success'}
            icon={maintenanceActive ? 'construct' : 'radio-button-on'}
            onPress={() => navigation.navigate('AdminSettings')}
          />
          <AdminChip
            label={isVip ? 'Cihaz: VIP' : 'Cihaz: ücretsiz'}
            tone={isVip ? 'warning' : 'default'}
            icon="diamond-outline"
            onPress={() => admin.toggleVip(localUser.id)}
          />
          <AdminChip
            label={`Rol: ${localUser.role}`}
            tone="info"
            icon="shield-checkmark-outline"
            onPress={() => navigation.navigate('AdminUsers')}
          />
        </View>

        {announcement.enabled && !!announcement.text.trim() && (
          <View
            style={[
              styles.banner,
              {
                backgroundColor:
                  announcement.tone === 'warning'
                    ? colors.warningSoft
                    : announcement.tone === 'success'
                    ? colors.successSoft
                    : colors.primarySoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="megaphone"
              size={15}
              color={
                announcement.tone === 'warning'
                  ? colors.warning
                  : announcement.tone === 'success'
                  ? colors.success
                  : colors.primary
              }
            />
            <Text
              style={[
                styles.bannerText,
                {
                  color:
                    announcement.tone === 'warning'
                      ? colors.warning
                      : announcement.tone === 'success'
                      ? colors.success
                      : colors.primary,
                },
              ]}
            >
              {announcement.text}
            </Text>
          </View>
        )}

        <View style={styles.statGrid}>
          <StatCell label="Soru" value={stats.questionCount.toLocaleString('tr-TR')} icon="help-circle-outline" />
          <StatCell label="Konu" value={String(stats.topicCount)} icon="albums-outline" />
          <StatCell label="Hap bilgi" value={String(admin.tips.length)} icon="bulb-outline" />
          <StatCell label="Kullanıcı" value={String(users.length)} icon="people-outline" />
          <StatCell
            label="VIP"
            value={`${stats.vipCount}/${users.length}`}
            icon="diamond-outline"
            tone="warning"
          />
          <StatCell
            label="Erişimi kısıtlı"
            value={String(stats.blockedCount)}
            icon="ban-outline"
            tone={stats.blockedCount > 0 ? 'danger' : 'default'}
          />
        </View>

        <AdminSectionTitle label="Bölümler" hint="Her alana doğrudan geç" />
        <View style={styles.shortcutGrid}>
          {SHORTCUTS.map(s => (
            <Pressable
              key={s.id}
              onPress={() => navigation.navigate(s.route)}
              style={({ pressed }) => [
                styles.shortcut,
                {
                  backgroundColor: colors.surface,
                  borderColor: pressed ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={[styles.shortcutIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={s.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.shortcutLabel, { color: colors.text }]}>{s.label}</Text>
              <Text style={[styles.shortcutDesc, { color: colors.textMuted }]}>{s.desc}</Text>
            </Pressable>
          ))}
        </View>

        <AdminSectionTitle
          label="İçerik kaynağı"
          hint="Bir alanı düzenlediğinde içeriğin kopyası cihaza alınır ve uygulama onu kullanır. “Buluttan geri yükle” ile canlı Firestore içeriğine dönersin."
        />
        <AdminCard pad={4}>
          <AdminRow
            compact
            icon="grid-outline"
            title="Ders sırası ve görünürlük"
            subtitle={`${admin.courseOrder.length} ders • ${admin.hiddenCourses.length} gizli`}
            right={
              <AdminChip
                label={overrides.courses ? 'Yerel' : 'Bulut'}
                tone={overrides.courses ? 'warning' : 'success'}
                compact
              />
            }
            onPress={() => navigation.navigate('AdminCourses')}
          />
          <AdminRow
            compact
            icon="albums-outline"
            title="Konu listeleri"
            subtitle={
              overrides.topics
                ? `${overrides.topics} derste yerel düzenleme`
                : 'Tüm dersler buluttan okunuyor'
            }
            right={
              <AdminChip
                label={overrides.topics ? `${overrides.topics} ders` : 'Bulut'}
                tone={overrides.topics ? 'warning' : 'success'}
                compact
              />
            }
            onPress={() => navigation.navigate('AdminTopics')}
          />
          <AdminRow
            compact
            icon="document-text-outline"
            title="Soru havuzu"
            subtitle={
              overrides.questions
                ? `${overrides.questions} konuda yerel soru listesi`
                : 'Sorular canlı Firestore’dan geliyor'
            }
            right={
              <AdminChip
                label={overrides.questions ? `${overrides.questions} konu` : 'Bulut'}
                tone={overrides.questions ? 'warning' : 'success'}
                compact
              />
            }
            onPress={() => navigation.navigate('AdminQuestions')}
          />
          <AdminRow
            compact
            style={{ borderBottomWidth: 0 }}
            icon="bulb-outline"
            title="Hap bilgiler"
            subtitle={`${admin.tips.length} madde`}
            right={
              <AdminChip
                label={overrides.tips ? 'Yerel' : 'Bulut'}
                tone={overrides.tips ? 'warning' : 'success'}
                compact
              />
            }
            onPress={() => navigation.navigate('AdminTips')}
          />
        </AdminCard>

        <AdminSectionTitle label="Bu cihazın ilerlemesi" hint="Yerel profilin gerçek verileri" />
        <AdminCard>
          <View style={styles.progressGrid}>
            <MiniStat label="Deneme" value={String(Object.keys(results).length)} />
            <MiniStat label="Bugün çözülen" value={String(todayStats.solved)} />
            <MiniStat label="Bugün odak" value={`${todayStats.focusMinutes} dk`} />
            <MiniStat label="Hata defteri" value={String(mistakes.length)} />
            <MiniStat label="Favori" value={String(favorites.length)} />
            <MiniStat label="Seri" value={`${streak.current} gün`} />
          </View>
          <View style={styles.progressActions}>
            <AdminButton
              small
              tone="neutral"
              icon="refresh-outline"
              label={busy ? 'Yenileniyor…' : 'İçerikleri yenile'}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await refreshAllCourses();
                } finally {
                  setBusy(false);
                }
              }}
              flex
            />
            <AdminButton
              small
              tone={isVip ? 'danger' : 'ghost'}
              icon="diamond-outline"
              label={isVip ? 'VIP’i kapat' : 'VIP ver'}
              onPress={() => admin.toggleVip(localUser.id)}
              flex
            />
          </View>
          {stats.expiringSoon > 0 && (
            <Text style={[styles.expiring, { color: colors.warning }]}>
              {stats.expiringSoon} kullanıcının VIP süresi 7 gün içinde doluyor.
            </Text>
          )}
        </AdminCard>

        <AdminSectionTitle
          label="Son işlemler"
          hint={activity.length === 0 ? 'Henüz işlem kaydı yok.' : undefined}
        />
        <AdminCard>
          {activity.length === 0 ? (
            <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 18 }}>
              Panelde yaptığın her değişiklik (soru, konu, kullanıcı, ayar) burada listelenir.
            </Text>
          ) : (
            activity.slice(0, 10).map((a, i, arr) => (
              <AdminRow
                key={a.id}
                compact
                icon={a.icon}
                title={a.label}
                subtitle={formatStamp(a.at)}
                style={{ borderBottomWidth: i === arr.length - 1 ? 0 : StyleSheet.hairlineWidth }}
              />
            ))
          )}
        </AdminCard>

        <AdminSectionTitle label="Panel" />
        <View style={styles.footer}>
          <AdminButton
            label="Kilidi kapat"
            tone="neutral"
            icon="lock-closed-outline"
            onPress={lock}
            flex
          />
          <AdminButton
            label="Tüm yönetimi sıfırla"
            tone="danger"
            icon="alert-circle-outline"
            onPress={() => setConfirmReset(true)}
            flex
          />
        </View>
        <Text style={[styles.footerHint, { color: colors.textMuted }]}>
          Sıfırlama; yerel içerik düzenlemelerini, kullanıcıları, ayarları ve günlük kayıtlarını
          siler. Uygulama ilerlemen (deneme, favori, hata defteri) korunur.
        </Text>
      </AdminGate>

      <AdminConfirm
        visible={confirmReset}
        title="Tüm yönetim verisini sil"
        confirmLabel="Sıfırla"
        message="Yerel içerik override’ları, kullanıcı kayıtları, ayarlar ve işlem geçmişi kalıcı olarak silinecek."
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          await admin.resetAllContent();
        }}
      />
    </AdminScaffold>
  );
};

const StatCell: React.FC<{
  label: string;
  value: string;
  icon: string;
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'info';
}> = ({ label, value, icon, tone = 'default' }) => {
  const { colors } = useAppTheme();
  const fg =
    tone === 'warning'
      ? colors.warning
      : tone === 'danger'
      ? colors.danger
      : tone === 'success'
      ? colors.success
      : colors.primary;
  return (
    <View style={[styles.statCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={15} color={fg} />
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.miniStat, { backgroundColor: colors.surfaceSecondary }]}>
      <Text style={[styles.miniValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
};

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month} • ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  lockBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  statCell: { flexBasis: '31%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: 10, gap: 3 },
  statValue: { fontSize: 17, fontWeight: '900' },
  statLabel: { fontSize: 10.5 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { flexBasis: '47.5%', flexGrow: 1, borderRadius: 16, borderWidth: 1, padding: 12, gap: 5 },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { fontSize: 13.5, fontWeight: '800' },
  shortcutDesc: { fontSize: 11, lineHeight: 15 },
  progressGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniStat: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexBasis: '30%',
    flexGrow: 1,
  },
  miniValue: { fontSize: 14, fontWeight: '900' },
  miniLabel: { fontSize: 10.5 },
  progressActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  expiring: { fontSize: 11.5, fontWeight: '700', marginTop: 10, lineHeight: 16 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footerHint: { fontSize: 11, lineHeight: 16, marginTop: 8 },
});
