import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../lib/theme';
import {
  collectionPath,
  DEFAULT_TARGET,
  firestoreTarget,
  probeUrls,
  type FirestoreTarget,
} from '../lib/firebaseConfig';
import {
  buildSeedPlan,
  CONTENT_LOCK_PATH,
  describePlan,
  planWarnings,
  readLockState,
  runSeed,
  type SeedPlan,
  type SeedProgress,
  type SeedResult,
} from '../lib/contentSeed';
import {
  describeCopyPlan,
  LEGACY_SOURCE,
  planCopy,
  runCopy,
  sourceBase,
  type CopyPlan,
  type CopyProgress,
  type CopyResult,
} from '../lib/contentCopy';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { useApp } from '../lib/AppContext';
import { ThemePreference } from '../lib/theme';
import {
  AdminButton,
  AdminCard,
  AdminChip,
  AdminConfirm,
  AdminField,
  AdminRow,
  AdminScaffold,
  AdminSectionTitle,
  AdminSegmented,
  AdminSheet,
  AdminStepper,
  AdminToggle,
} from '../components/admin/ui';
import { AdminGate } from '../components/admin/AdminGate';
import {
  addAdminEmail,
  readAdminList,
  readMembershipLockdown,
  ADMINS_DOC_PATH,
  MEMBERSHIP_LOCKDOWN_DOC_PATH,
} from '../lib/firestoreApi';
import {
  authConfigSource,
  clearDeviceApiKey,
  healForeignAuthProject,
  currentSession,
  ensureAuthConfigLoaded,
  isAuthConfigured,
  maskKey,
  probeAuth,
  readDeviceApiKey,
  resolveAuthConfig,
  resetAuthConfigCache,
  signOut as authSignOut,
} from '../lib/authClient';
import { hasRepoApiKey } from '../config/firebaseApp';
import { membershipBuildLabel } from '../lib/buildTag';

export const AdminSettingsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const admin = useAdmin();
  const app = useApp();
  const { settings, patchSettings } = admin;
  const membershipPolicy = settings.membership;
  const membership = useMembership();

  const [pinSheet, setPinSheet] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [dataSheet, setDataSheet] = useState<'export' | 'import' | null>(null);
  const [importDraft, setImportDraft] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'content' | 'all' | null>(null);
  const [probe, setProbe] = useState<{ busy: boolean; text: string; tone: 'info' | 'success' | 'danger' }>({
    busy: false,
    text: 'Henüz test edilmedi',
    tone: 'info',
  });

  const fsTarget: FirestoreTarget = firestoreTarget();
  // Sık düşülen tuzak: yeni proje kimliği verip yol önekini legacy'de bırakmak
  // (veya tam tersi). Panelde uyar, çünkü iki ayar birlikte anlam kazanıyor.
  const rootConfigWarnings: string[] = [];
  if (fsTarget.projectId !== DEFAULT_TARGET.projectId && fsTarget.root !== '') {
    rootConfigWarnings.push(
      `Proje “${fsTarget.projectId}” ama root hâlâ ${fsTarget.root} — yeni projede bu ağacı oluşturmadıysan EXPO_PUBLIC_FIRESTORE_ROOT=. ver.`
    );
  }
  if (fsTarget.projectId === DEFAULT_TARGET.projectId && fsTarget.root === '') {
    rootConfigWarnings.push(
      'Root kök (“.”) ama proje hâlâ kpss-asistani — eski projede /courses beklenen veri yok, panelde tohumlama yapman gerekir.'
    );
  }

  /* Firebase web API anahtarı KULLANICIDAN İSTENMEZ: depoda `config/firebaseApp.ts`
     içinde durur. Aşağıdaki state yalnız eski kurulumlardan kalan cihaz kaydını
     göstermek/clear etmek için tutuluyor. */
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await ensureAuthConfigLoaded();
      const k = await readDeviceApiKey();
      if (alive) setDeviceKey(k);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const removeDeviceKey = async () => {
    setKeyBusy(true);
    await clearDeviceApiKey();
    await ensureAuthConfigLoaded();
    resetAuthConfigCache();
    setDeviceKey(null);
    setKeyBusy(false);
    setKeyNote(
      hasRepoApiKey()
        ? 'Cihaz kaydı silindi — depodaki anahtar (config/firebaseApp.ts) kullanılmaya devam ediyor.'
        : 'Cihaz kaydı silindi. Depoda anahtar yoksa yerel PBKDF2 moduna dönülür.'
    );
  };

  const authSourceLabel =
    authConfigSource() === 'device'
      ? 'bu cihazda kayıtlı eski anahtar'
      : authConfigSource() === 'env'
        ? '.env.local (pakete gömülü)'
        : authConfigSource() === 'repo'
          ? 'depoya gömülü config (config/firebaseApp.ts)'
          : 'yok';

  /* eski projeden içerik kopyalama (terminal gerekmez) */
  const [copySrc, setCopySrc] = useState(LEGACY_SOURCE.projectId);
  const [copyPlan, setCopyPlan] = useState<CopyPlan | null>(null);
  const [copyBusy, setCopyBusy] = useState<'plan' | 'run' | null>(null);
  const [copyProgress, setCopyProgress] = useState<CopyProgress | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [copySkip, setCopySkip] = useState(true);

  const doCopyPlan = async () => {
    setCopyBusy('plan');
    setCopyPlan(null);
    setCopyResult(null);
    setCopyProgress(null);
    const p = await planCopy(copySrc.trim() || LEGACY_SOURCE.projectId);
    setCopyPlan(p);
    setCopyBusy(null);
  };

  const doCopyRun = async () => {
    if (!copyPlan) return;
    setCopyBusy('run');
    setCopyResult(null);
    const r = await runCopy(copyPlan, {
      concurrency: 4,
      skipExisting: copySkip,
      onProgress: pr => setCopyProgress(pr),
    });
    setCopyResult(r);
    setCopyBusy(null);
    // içerik yazıldıysa kilit rozeti bayatlamış olabilir — doğrudan tekrar oku
    setLockState(await readLockState());
  };

  /* yönetim anahtarları (meta/admins + meta/membership_lockdown) */
  const [gov, setGov] = useState<{
    busy: boolean;
    emails: string[];
    locked: boolean | null;
    note: string;
  }>({ busy: false, emails: [], locked: null, note: 'Henüz kontrol edilmedi' });

  const refreshGov = async () => {
    setGov(g => ({ ...g, busy: true, note: 'Okunuyor…' }));
    const [admins, lock] = await Promise.all([readAdminList(), readMembershipLockdown()]);
    if (!admins.ok && !lock.ok) {
      setGov({ busy: false, emails: [], locked: null, note: `Okunamadı: ${admins.error}` });
      return;
    }
    setGov({
      busy: false,
      emails: admins.ok ? admins.data.emails : [],
      locked: lock.ok ? lock.data : null,
      note: [
        admins.ok ? (admins.data.exists ? `${admins.data.emails.length} yönetici kaydı` : 'meta/admins henüz yok') : admins.error,
        lock.ok ? (lock.data ? 'kilit AÇIK' : 'kilit kapalı') : 'kilit durumu okunamadı',
      ].join(' • '),
    });
  };

  const promoteSelf = async () => {
    const email = membership.member?.email || membership.member?.emailNormalized || '';
    if (!email) {
      setGov(g => ({ ...g, note: 'Önce üye olarak giriş yap; listenizdeki e-posta eklenir.' }));
      return;
    }
    setGov(g => ({ ...g, busy: true, note: 'Yazılıyor…' }));
    const res = await addAdminEmail(email);
    if (!res.ok) {
      setGov({ ...gov, busy: false, note: `Eklenemedi: ${res.error}` });
      return;
    }
    const lock = await readMembershipLockdown();
    setGov({ busy: false, emails: res.data, locked: lock.ok ? lock.data : null, note: `Listede ${res.data.length} e-posta • ${lock.ok && lock.data ? 'kilit AÇIK (liste artık Console’dan)' : 'kilit kapalı'}` });
  };

  /* Firebase Auth durumu */
  const [authProbe, setAuthProbe] = useState<{
    busy: boolean;
    text: string;
    tone: 'info' | 'success' | 'danger';
  }>({ busy: false, text: 'Henüz test edilmedi', tone: 'info' });
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  // render sırasında okunur; runAuthProbe cache'i sıfırladığı için anahtar sonradan
  // .env.local'a eklendiyse test sonrası kart kendini tazeler.
  const authCfg = resolveAuthConfig();

  const runAuthProbe = async () => {
    setAuthProbe({ busy: true, text: 'Deniyor…', tone: 'info' });
    resetAuthConfigCache();
    try {
      const r = await probeAuth();
      const s2 = await currentSession();
      setAuthInfo(
        s2
          ? `${s2.email} • uid ${s2.uid.slice(0, 10)}… • token ${s2.expiresAt > Date.now() ? 'geçerli' : 'yenilenecek'}`
          : 'Bu cihazda kayıtlı Firebase oturumu yok.'
      );
      setAuthProbe({ busy: false, text: r.note, tone: r.ok ? 'success' : 'danger' });
    } catch (e) {
      setAuthProbe({ busy: false, text: `Test yapılamadı: ${String(e)}`, tone: 'danger' });
    }
  };

  /* içerik tohumlama (bootstrap) */
  const [seedPlan, setSeedPlan] = useState<SeedPlan | null>(null);
  const [seedBusy, setSeedBusy] = useState<'plan' | 'write' | null>(null);
  const [seedProgress, setSeedProgress] = useState<SeedProgress | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [includeFallback, setIncludeFallback] = useState(false);
  const [lockState, setLockState] = useState<'open' | 'locked' | 'unknown'>('unknown');

  const checkLock = async () => setLockState(await readLockState());

  const makePlan = async () => {
    setSeedBusy('plan');
    setSeedNote(null);
    setSeedResult(null);
    try {
      const plan = await buildSeedPlan({ includeFallbackQuestions: includeFallback });
      setSeedPlan(plan);
      setLockState(plan.unlocked === null ? 'unknown' : plan.unlocked ? 'open' : 'locked');
    } catch (e) {
      setSeedNote(e instanceof Error ? e.message : 'Plan çıkarılamadı');
    } finally {
      setSeedBusy(null);
    }
  };

  const writePlan = async () => {
    if (!seedPlan) return;
    setSeedBusy('write');
    setSeedNote(null);
    setSeedResult(null);
    const res = await runSeed(seedPlan.docs, p => setSeedProgress(p));
    setSeedResult(res);
    setSeedBusy(null);
    if (res.failed.length) {
      const first = res.failed[0];
      setSeedNote(`${res.failed.length} belge yazılamadı — ilk hata: ${first.error}`);
      void checkLock();
    }
  };

  /** İki anonim REST okuması: üyelik koleksiyonu + içerik. Yazma denemez. */
  const runProbe = async () => {
    setProbe({ busy: true, text: 'Deniyor…', tone: 'info' });
    const urls = probeUrls(fsTarget);
    const hit = async (label: string, url: string) => {
      try {
        const res = await fetch(url);
        if (res.ok) return `${label}: OK`;
        if (res.status === 404) return `${label}: 404 (koleksiyon/belge henüz yok — normal)`;
        if (res.status === 403 || res.status === 401) return `${label}: REDDEDİLDİ (rules)`;
        return `${label}: HTTP ${res.status}`;
      } catch {
        return `${label}: ağ hatası`;
      }
    };
    const [members, tips] = await Promise.all([
      hit('memberships', urls.memberships),
      hit('daily_tips', urls.tips),
    ]);
    const bad = /REDDEDİLDİ|ağ hatası/.test(`${members} ${tips}`);
    setProbe({
      busy: false,
      text: `${members} • ${tips}`,
      tone: members.includes('REDDEDİLDİ') ? 'danger' : bad ? 'danger' : 'success',
    });
  };

  return (
    <AdminScaffold
      title="Uygulama Ayarları"
      subtitle="Duyuru, bakım, VIP politikası, varsayılanlar ve veri"
      icon="settings-outline"
      right={
        <AdminChip
          label={settings.maintenance.enabled ? 'Bakımda' : 'Yayında'}
          tone={settings.maintenance.enabled ? 'danger' : 'success'}
          compact
        />
      }
    >
      <AdminGate>
        {/* Maintenance */}
        <AdminSectionTitle
          label="Bakım modu"
          hint="Açıksa uygulama içeriğe kilitlenir; yönetici girişi yapmış olanlar paneli kullanmaya devam eder."
        />
        <AdminCard>
          <AdminToggle
            icon="construct-outline"
            label="Bakım modunu aç"
            description="Kullanıcılar yalnızca bakım ekranını görür."
            value={settings.maintenance.enabled}
            onValueChange={v => patchSettings({ maintenance: { ...settings.maintenance, enabled: v } })}
          />
          <AdminField
            label="Bakım başlığı"
            value={settings.maintenance.title}
            onChangeText={t => patchSettings({ maintenance: { ...settings.maintenance, title: t } })}
          />
          <AdminField
            label="Bakım mesajı"
            value={settings.maintenance.message}
            onChangeText={t => patchSettings({ maintenance: { ...settings.maintenance, message: t } })}
            multiline
          />
        </AdminCard>

        {/* Announcement */}
        <AdminSectionTitle label="Duyuru şeridi" hint="Ana ekranın en üstünde gösterilir" />
        <AdminCard>
          <AdminToggle
            icon="megaphone-outline"
            label="Duyurayı göster"
            value={settings.announcement.enabled}
            onValueChange={v => patchSettings({ announcement: { ...settings.announcement, enabled: v } })}
          />
          <AdminSegmented
            label="Ton"
            value={settings.announcement.tone}
            onChange={id =>
              patchSettings({
                announcement: { ...settings.announcement, tone: id as 'info' | 'warning' | 'success' },
              })
            }
            options={[
              { id: 'info', label: 'Bilgi' },
              { id: 'warning', label: 'Uyarı' },
              { id: 'success', label: 'Müjde' },
            ]}
          />
          <AdminField
            label="Metin"
            value={settings.announcement.text}
            onChangeText={t => patchSettings({ announcement: { ...settings.announcement, text: t } })}
            multiline
            placeholder="Örn: Güncel Bilgiler 2026 özeti eklendi."
          />
        </AdminCard>

        {/* VIP policy */}
        <AdminSectionTitle
          label="VIP politikası"
          hint="Kapıları açtığında ilgili bölüm yalnızca VIP profiller için çalışır. Bu cihazın profili panelin kullanıcılar bölümünden VIP yapılabilir."
        />
        <AdminCard>
          <AdminToggle
            icon="ribbon-outline"
            label="Karma deneme VIP’e özel"
            value={settings.vipGates.karmaExam}
            onValueChange={v => patchSettings({ vipGates: { ...settings.vipGates, karmaExam: v } })}
          />
          <AdminToggle
            icon="bulb-outline"
            label="Hap bilgiler VIP’e özel"
            value={settings.vipGates.tips}
            onValueChange={v => patchSettings({ vipGates: { ...settings.vipGates, tips: v } })}
          />
          <AdminToggle
            icon="refresh-outline"
            label="Tekrarım (hata defteri) VIP’e özel"
            value={settings.vipGates.review}
            onValueChange={v => patchSettings({ vipGates: { ...settings.vipGates, review: v } })}
          />
          <AdminToggle
            icon="stats-chart-outline"
            label="Odak & Net istatistikleri VIP’e özel"
            value={settings.vipGates.focus}
            onValueChange={v => patchSettings({ vipGates: { ...settings.vipGates, focus: v } })}
          />
          <AdminStepper
            label="Deneme süresi"
            description="Yeni kullanıcılara tanınan ücretsiz VIP gün sayısı."
            value={settings.vipTrialDays}
            min={0}
            max={90}
            onChange={v => patchSettings({ vipTrialDays: v })}
            suffix="gün"
          />
        </AdminCard>

        {/* Membership policy */}
        <AdminSectionTitle
          label="Üyelik & test limiti"
          hint="Üye olmayan (ve ücretsiz üye) her dersten yalnızca belirlenen sayıda test çözer. Tüm üyelik kayıtları Firestore’dadır."
        />
        <AdminCard>
          <AdminToggle
            icon="lock-closed-outline"
            label="Limit uygulansın"
            description="Kapatırsan herkes sınırsız çözer. Firestore kurallarını dağıtmadan önce geçici kaçış kapısı."
            value={membershipPolicy.enforce}
            onValueChange={v =>
              patchSettings({ membership: { ...membershipPolicy, enforce: v } })
            }
          />
          <AdminStepper
            label="Ücretsiz test / ders"
            description="Ders başına çözülebilen test sayısı. Tarih için 1, Türkçe için 1 ayrı hak tanınır."
            value={membershipPolicy.freeTestsPerCourse}
            min={0}
            max={20}
            onChange={v =>
              patchSettings({
                membership: { ...membershipPolicy, freeTestsPerCourse: v },
              })
            }
            suffix="test"
          />
          <AdminToggle
            icon="cloud-outline"
            label="VIP durumu Firestore’dan okunsun"
            description="Açıkken üyelik belgesindeki `vip`/`vipPlan`/`vipExpiresAt` esas alınır. Kapatırsan yalnızca bu cihazın yerel etiketi geçerli."
            value={membershipPolicy.cloudVip}
            onValueChange={v => patchSettings({ membership: { ...membershipPolicy, cloudVip: v } })}
          />
          <AdminToggle
            icon="people-outline"
            label="Panel listesi Firestore üyelerini göstersin"
            description="Kullanıcılar ekranı demo kayıtlar yerine `memberships` koleksiyonundaki gerçek belgeleri listeler."
            value={membershipPolicy.cloudMembers}
            onValueChange={v =>
              patchSettings({ membership: { ...membershipPolicy, cloudMembers: v } })
            }
          />
          <AdminStepper
            label="Yeni kayıt deneme VIP"
            description="Kaydolacak üyelere tanınacak gün sayısı (0 = deneme yok)."
            value={membershipPolicy.defaultTrialDays}
            min={0}
            max={90}
            onChange={v =>
              patchSettings({ membership: { ...membershipPolicy, defaultTrialDays: v } })
            }
            suffix="gün"
          />
          <AdminToggle
            icon="hourglass-outline"
            label="Kayıtlar onay beklesin"
            description="Yeni üyeler `pending` durumunda oluşur; sen onaylayana kadar erişim kısıtlı kalır."
            value={membershipPolicy.requireApproval}
            onValueChange={v =>
              patchSettings({ membership: { ...membershipPolicy, requireApproval: v } })
            }
          />
          <AdminRow
            icon="person-badge-outline"
            title="Üyelik paneli"
            subtitle="Üye oluştur, düzenle, plan/rol değiştir, sil — doğrudan Firestore’a yazar"
            onPress={() => navigation.navigate('AdminMembership')}
            badge={membershipPolicy.cloudMembers ? 'bulut' : 'yerel'}
          />
        </AdminCard>

        {/* Firestore hedefi */}
        <AdminSectionTitle
          label="Firestore bağlantısı"
          hint="İçerik ve üyeliklerin okunduğu proje. Değerler derleme zamanında çözülür: EXPO_PUBLIC_* → app.json (expo.extra.firestore) → varsayılan."
        />
        <AdminCard>
          <AdminRow
            icon="cloud-outline"
            title="Proje kimliği"
            subtitle="EXPO_PUBLIC_FIRESTORE_PROJECT"
            right={<Text style={{ fontSize: 12, fontWeight: '900', color: colors.text }}>{fsTarget.projectId}</Text>}
          />
          <AdminRow
            icon="albums-outline"
            title="Veritabanı"
            subtitle="Yeni kurulumda (default) bırak"
            right={<Text style={{ fontSize: 12, fontWeight: '900', color: colors.text }}>{fsTarget.databaseId}</Text>}
          />
          <AdminRow
            icon="git-branch-outline"
            title="Yol öneki (root)"
            subtitle={fsTarget.root ? 'Legacy düzen: artifacts/{proje}/public/data' : 'Kök düzen: koleksiyonlar doğrudan /courses, /memberships altında'}
            right={
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted }} numberOfLines={1}>
                {fsTarget.root || '(kök)'}
              </Text>
            }
          />
          <AdminRow
            icon="person-badge-outline"
            title="Üyelik koleksiyonu"
            subtitle={`Kayıtlar ve panel listesi bu yolu kullanır · üyelikler yalnızca Firestore’da, cihazda kopya tutulmaz (kod ${membershipBuildLabel()})`}
            right={
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted }} numberOfLines={1}>
                {collectionPath('memberships')}
              </Text>
            }
          />
          <AdminRow
            icon="code-slash-outline"
            title="Ayar kaynağı"
            subtitle={
              fsTarget.source === 'default'
                ? 'Repo varsayılanı — yeni proje için .env veya app.json kullan'
                : `${fsTarget.source} üzerinden verildi`
            }
            right={<AdminChip label={fsTarget.source} tone="info" compact />}
          />
          <View
            style={{
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSecondary,
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textMuted, marginBottom: 4 }}>
              TEK KOMUTLU KURULUM (terminalde)
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'monospace' }} selectable>
              npm run setup:firestore -- {fsTarget.projectId} --root .
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'monospace', marginTop: 2 }} selectable>
              npm run check:firestore
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.textMuted, marginTop: 6, lineHeight: 15 }}>
              Birincisi .env.local + .firebaserc yazar, ikincisi kuralları/okuma-yazmayı
              dener. Kurallar için: npm run deploy:rules
            </Text>
          </View>
          {rootConfigWarnings.length ? (
            <Text style={{ fontSize: 11.5, color: colors.warning, lineHeight: 17, marginTop: 2 }}>
              {rootConfigWarnings.join(' • ')}
            </Text>
          ) : null}
          <AdminRow
            icon="pulse-outline"
            title="Bağlantı testi"
            subtitle={probe.text}
            right={
              <AdminButton
                small
                label={probe.busy ? 'Test ediliyor' : 'Test et'}
                disabled={probe.busy}
                tone={probe.tone === 'danger' ? 'danger' : probe.tone === 'success' ? 'success' : 'primary'}
                onPress={() => void runProbe()}
              />
            }
          />
        </AdminCard>

        {/* Firebase Auth */}
        <AdminSectionTitle
          label="Firebase Auth (kimlik doğrulama)"
          hint="Anahtar uygulamanın içinde: config/firebaseApp.ts (bir kez yazılır, commit’lenir). Tanımlıysa parola Firebase’de doğrulanır ve Firestore istekleri idToken taşır; senden bir yere anahtar yapıştırman istenmez."
        />
        <AdminCard>
          <AdminRow
            icon="key-outline"
            title="Kimlik modu"
            subtitle={
              isAuthConfigured()
                ? `Firebase Auth açık — üyelik belgelerinde parola hash’i tutulmuyor. Kaynak: ${authSourceLabel}`
                : 'Yerel mod — parola cihazda hash’lenip belgeye yazılıyor. Anahtar depoya yazıldığı an bu satır kendiliğinden Firebase Auth’a döner.'
            }
            right={
              <AdminChip
                label={isAuthConfigured() ? 'firebase-auth' : 'pbkdf2'}
                tone={isAuthConfigured() ? 'success' : 'info'}
              />
            }
          />
          {!isAuthConfigured() ? (
            <View style={{ paddingHorizontal: 2, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
                {'Anahtarı kendin girmeye çalışman gerekmiyor. Tek yapman gereken anahtarı'}{'\n'}
                {'geliştiriciye iletmek; o da `config/firebaseApp.ts` içine yazıp commit’liyor.'}{'\n'}
                {'Uygulama güncellendiği anda Firebase Auth kendiliğinden açılır.'}
              </Text>
            </View>
          ) : null}
          {deviceKey ? (
            <AdminRow
              icon="phone-portrait-outline"
              title="Bu cihazda kayıtlı eski anahtar"
              subtitle={`${maskKey(deviceKey)} — depodaki anahtardan önce bunu kullanır. Kaldırırsan config değeri devreye girer.`}
              right={
                <AdminButton
                  small
                  tone="neutral"
                  label={keyBusy ? 'Uğraşıyor…' : 'Kaldır'}
                  disabled={keyBusy}
                  onPress={() => void removeDeviceKey()}
                />
              }
            />
          ) : null}
          {keyNote ? (
            <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginBottom: 6 }}>
              {keyNote}
            </Text>
          ) : null}
          {authCfg ? (
            <AdminRow
              icon="pulse-outline"
              title="API anahtarı"
              subtitle={`Pakete gömülü public web anahtarı (gizli değil; koruma Firestore kurallarında). Kaynak: ${authSourceLabel}`}
              right={
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.textMuted }}>
                  {maskKey(authCfg.apiKey)}
                </Text>
              }
            />
          ) : null}
          <AdminRow
            icon="person-circle-outline"
            title="Bu cihazdaki oturum"
            subtitle={authInfo ?? 'Test edince görünür (Firestore işlemleri bu token ile gider).'}
            right={
              <AdminButton
                small
                tone="neutral"
                label="Oturumu kapat"
                onPress={() => {
                  void authSignOut().then(() =>
                    setAuthInfo('Oturum kapatıldı (üyelik belgesine dokunulmadı).')
                  );
                }}
              />
            }
          />
          <AdminRow
            icon="people-outline"
            title="Yönetici listesi"
            subtitle={gov.emails.length ? gov.emails.join(', ') : 'meta/admins belgesi yok — “Kendimi ekle” ile oluşturabilirsin (Admin SDK gerekmez).'}
            right={
              <AdminButton
                small
                label="Kendimi ekle"
                disabled={gov.busy || gov.locked === true}
                onPress={() => void promoteSelf()}
              />
            }
          />
          <AdminRow
            icon="lock-closed-outline"
            title="Üyelik kilidi"
            subtitle={`meta/membership_lockdown: ${gov.locked === null ? 'bilinmiyor' : gov.locked ? 'AÇIK — kimliksiz üyelik okuma/yazma kapalı' : 'kapalı (bugünkü davranış)'}`}
            right={
              <AdminButton
                small
                tone="neutral"
                label={gov.busy ? 'Okunuyor' : 'Yenile'}
                disabled={gov.busy}
                onPress={() => void refreshGov()}
              />
            }
          />
          <View style={{ paddingHorizontal: 2, gap: 2 }}>
            <Text style={{ fontSize: 10.5, color: colors.textMuted, lineHeight: 15 }}>
              Kilidi açmak yalnız Console işidir (uygulama meta altına yazamaz) — belgeyi
              silmek anında geri alır, kuralı yeniden yayımlamaya gerek yok:
            </Text>
            <Text selectable style={{ fontSize: 10.5, color: colors.text, fontFamily: 'monospace', lineHeight: 15 }}>
              Firestore → Data → Add document → collection `meta` → ID `membership_lockdown`
              → alan `note` (string) = `kilitli` → Save
            </Text>
            <Text selectable style={{ fontSize: 10, color: colors.textMuted, fontFamily: 'monospace', lineHeight: 14 }}>
              beklenen yollar → {ADMINS_DOC_PATH} • {MEMBERSHIP_LOCKDOWN_DOC_PATH}
            </Text>
            <Text style={{ fontSize: 10, color: colors.textMuted, lineHeight: 14 }}>
              Liste yolu yanlış görünüyorsa EXPO_PUBLIC_FIRESTORE_ROOT ayarını kontrol et
              (yukarıdaki “Yol öneki (root)” satırı).
            </Text>
          </View>
          <AdminRow
            icon="flask-outline"
            title="Sağlayıcı testi"
            subtitle={authProbe.text}
            right={
              <AdminButton
                small
                label={authProbe.busy ? 'Test ediliyor' : 'Test et'}
                disabled={authProbe.busy}
                tone={authProbe.tone === 'danger' ? 'danger' : authProbe.tone === 'success' ? 'success' : 'primary'}
                onPress={() => void runAuthProbe()}
              />
            }
          />
          <View
            style={{
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSecondary,
              marginBottom: 4,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textMuted, marginBottom: 4 }}>
              AUTH’U BAĞLAMA SIRASI
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.textSecondary, lineHeight: 16 }}>
              1) Console → Project settings → General → Your apps → **Add app → Web** → bir ad ver →
              “Register app” (npm/Next.js adımlarını atla) → çıkan SDK config içindeki `apiKey`{'\n'}
              (Your apps boşsa anahtar da yoktur; tek yapman gereken bu kayıt.){'\n'}
              2) Console → Authentication → Sign-in method → **Email/Password → Enable**{'\n'}
              3) Anahtarı geliştiriciye ilet → o `config/firebaseApp.ts` içine yazar ve commit’ler.
              Panelden/uygulamadan hiçbir şey girmene gerek yok.{'\n'}
              3b) Kalıcı/override iki yol daha var (yalnız geliştirici için):
            </Text>
            <Text
              selectable
              style={{ fontSize: 11.5, color: colors.text, fontFamily: 'monospace', marginTop: 4 }}
            >
              npm run setup:firestore -- {fsTarget.projectId} --root . --api-key &lt;ANAHTAR&gt;
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.text, fontFamily: 'monospace' }} selectable>
              npm run deploy:rules
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.textMuted, marginTop: 6, lineHeight: 15 }}>
              4) “Test et” yeşil olmalı — anahtar depoda olduğu için sen hiçbir şey yapmıyorsun;
              Metro’yu yalnız geliştirici `npx expo start --clear` ile yeniden başlatır.{'\n'}
              5) Katı mod (kod değişikliği yok): Console'da `meta/membership_lockdown`
              belgesi oluştur → kimliksiz üyelik okuma/yazma anında kapanır.
              Geri almak = belgeyi silmek. Yukarıdaki “Üyelik kilidi” satırı durumu gösterir.
            </Text>
          </View>
        </AdminCard>

        {/* Eski projeden kopyala */}
        <AdminSectionTitle
          label="Eski projeden içeriği kopyala"
          hint="Canlı Firestore’daki courses/{ders}/topics/{konu} ve daily_tips/main belgelerini fields bloğu dönüştürülmeden bu projeye kopyalar. Kaynak anonim okunur, hedef yazımı içerik penceresi açıkken çalışır — terminal/script gerekmez."
        />
        <AdminCard>
          <AdminField
            label="Kaynak proje kimliği"
            value={copySrc}
            onChangeText={setCopySrc}
            autoCapitalize="none"
            maxLength={64}
            placeholder="kpss-asistani"
            hint={`Kök öneki otomatik denenir: artifacts/<proje>/public/data → veritabanı kökü. ${
              copyPlan ? `kaynak: ${sourceBase(copyPlan.source)}` : ''
            }`}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            <AdminButton
              small
              flex
              tone="ghost"
              icon="refresh"
              label={copyBusy === 'plan' ? 'Taranıyor…' : 'Kaynağı tara'}
              disabled={copyBusy !== null}
              onPress={() => void doCopyPlan()}
            />
            <AdminButton
              small
              flex
              icon="copy-outline"
              label={copyBusy === 'run' ? 'Kopyalanıyor…' : 'Bu projeye kopyala'}
              disabled={copyBusy !== null || !copyPlan || !!copyPlan?.error}
              onPress={() => void doCopyRun()}
            />
          </View>
          <AdminToggle
            icon="download-outline"
            label="Var olanları atla"
            description="Açıkken hedefte belgesi bulunan konu/ders yeniden yazılmaz (yarıda kesilen işi devam ettirmek için ideal). Kapatırsan kaynak neyse o yazılır."
            value={copySkip}
            onValueChange={setCopySkip}
          />
          {copyPlan?.error ? (
            <Text style={{ fontSize: 11.5, color: colors.danger, lineHeight: 17 }}>
              {copyPlan.error}
            </Text>
          ) : null}
          {copyPlan && !copyPlan.error ? (
            <Text style={{ fontSize: 11.5, color: colors.textSecondary, lineHeight: 17 }}>
              {describeCopyPlan(copyPlan)}
              {copyPlan.notes.length ? ` • ${copyPlan.notes.join(' • ')}` : ''}
            </Text>
          ) : null}
          {copyProgress && copyBusy === 'run' ? (
            <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 4 }}>
              {copyProgress.done}/{copyProgress.total} • {copyProgress.questions} soru •{' '}
              {copyProgress.current}
            </Text>
          ) : null}
          {copyResult ? (
            <Text
              style={{
                fontSize: 11.5,
                color: copyResult.failed.length ? colors.danger : colors.success,
                lineHeight: 17,
                marginTop: 4,
              }}
            >
              {copyResult.copied} belge kopyalandı • {copyResult.questions} soru
              {copyResult.skipped ? ` • ${copyResult.skipped} atlandı` : ''}
              {copyResult.failed.length ? ` • ${copyResult.failed.length} hata` : ''}
            </Text>
          ) : null}
          {copyResult?.failed.length ? (
            <View
              style={{
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceSecondary,
                marginBottom: 4,
              }}
            >
              {copyResult.failed.slice(0, 6).map(f => (
                <Text key={f} style={{ fontSize: 10.5, color: colors.danger, lineHeight: 15 }}>
                  – {f}
                </Text>
              ))}
              {copyResult.failed.length > 6 ? (
                <Text style={{ fontSize: 10.5, color: colors.textMuted }}>
                  … ve {copyResult.failed.length - 6} satır daha. “Var olanları atla” açıkken
                  düğmeye tekrar basarsan yalnız eksikler yazılır.
                </Text>
              ) : null}
            </View>
          ) : null}
          {lockState === 'locked' ? (
            <Text style={{ fontSize: 11, color: colors.warning, lineHeight: 16 }}>
              meta/content_lock var → içerik yazma kapalı; kopyalama reddedilir. Kilidi
              Console’dan kaldır (belgeyi sil), kopyala, sonra tekrar oluştur.
            </Text>
          ) : null}
        </AdminCard>

        {/* Content bootstrap */}
        <AdminSectionTitle
          label="Firestore klasörlerini oluştur (tohumlama)"
          hint="courses/{ders}/topics/{konu} ve daily_tips/main yapılarını panel oluşturur; memberships ilk kayıtta kendiliğinden açılır. “Planı çıkar” her konu için içeriği okur (birkaç saniye sürebilir), yazım 6 eşzamanlı istekle yapılır."
        />
        <AdminCard>
          <AdminRow
            icon="folder-open-outline"
            title="Yazılacak kök"
            subtitle={fsTarget.root ? `${fsTarget.projectId} → ${fsTarget.root}` : `${fsTarget.projectId} → veritabanı kökü`}
            right={
              <AdminChip
                label={lockState === 'open' ? 'yazılabilir' : lockState === 'locked' ? 'kilitli' : 'bilinmiyor'}
                tone={lockState === 'open' ? 'success' : lockState === 'locked' ? 'danger' : 'warning'}
                icon={lockState === 'locked' ? 'lock-closed' : 'lock-open-outline'}
                compact
                onPress={() => void checkLock()}
              />
            }
          />
          <AdminToggle
            icon="help-outline"
            label="Örnek soruları da yaz"
            description="Panelde düzenlenmemiş konulara repodaki yedek sorular kopyalanır. Kapalıysa yalnızca konu başlıkları oluşur, soruları sonra Console/panel ile eklersin."
            value={includeFallback}
            onValueChange={setIncludeFallback}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <AdminButton
              small
              flex
              tone="ghost"
              icon="calculator-outline"
              label={seedBusy === 'plan' ? 'Çıkarılıyor…' : 'Planı çıkar'}
              disabled={seedBusy !== null}
              onPress={() => void makePlan()}
            />
            <AdminButton
              small
              flex
              icon="cloud-upload-outline"
              label={
                seedBusy === 'write'
                  ? seedProgress
                    ? `${seedProgress.done}/${seedProgress.total}`
                    : 'Yazılıyor…'
                  : 'Firestore’a yaz'
              }
              disabled={seedBusy !== null || !seedPlan}
              onPress={() => void writePlan()}
            />
          </View>

          {seedPlan ? (
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginTop: 8 }}>
              {describePlan(seedPlan)} • {seedPlan.docs.length} belge • hedef: {seedPlan.target}
            </Text>
          ) : null}
          {seedProgress && seedBusy === 'write' ? (
            <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 4 }}>
              yazılıyor: {seedProgress.current}
            </Text>
          ) : null}
          {seedResult ? (
            <Text style={{ fontSize: 11.5, color: seedResult.failed.length ? colors.danger : colors.success, marginTop: 4 }}>
              {seedResult.written} belge yazıldı
              {seedResult.failed.length ? ` • ${seedResult.failed.length} hata` : ' • Collections Firestore’ta hazır'}
            </Text>
          ) : null}
          {seedPlan && seedPlan.notes.length ? (
            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
              {seedPlan.notes.join(' • ')}
            </Text>
          ) : null}
          {seedPlan && planWarnings(seedPlan).length ? (
            <Text style={{ fontSize: 11, color: colors.warning, marginTop: 4 }}>
              {planWarnings(seedPlan).join(' • ')}
            </Text>
          ) : null}
          {seedNote ? (
            <Text style={{ fontSize: 11.5, color: colors.danger, marginTop: 4 }}>{seedNote}</Text>
          ) : null}

          <View
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.text }}>
              Yazma penceresini kapat
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, lineHeight: 16 }}>
              Console → Firestore Data → “Start collection” → koleksiyon kimliği{' '}
              <Text style={{ fontFamily: 'monospace' }}>meta</Text>, belge kimliği{' '}
              <Text style={{ fontFamily: 'monospace' }}>content_lock</Text>, alan{' '}
              <Text style={{ fontFamily: 'monospace' }}>note</Text> = “kilitli”. Bu belge varken
              uygulama içeriğe yazamaz. (Yol: {CONTENT_LOCK_PATH})
            </Text>
          </View>
        </AdminCard>

        {/* Feature flags */}
        <AdminSectionTitle label="Özellikler" hint="Kapattığın an uygulama o öğeyi gizler/uygulamaz" />
        <AdminCard>
          <AdminToggle
            icon="flame-outline"
            label="Gün serisi (streak)"
            value={settings.featureFlags.streak}
            onValueChange={v => patchSettings({ featureFlags: { ...settings.featureFlags, streak: v } })}
          />
          <AdminToggle
            icon="heart-outline"
            label="Favori soru kaydetme"
            value={settings.featureFlags.favorites}
            onValueChange={v => patchSettings({ featureFlags: { ...settings.featureFlags, favorites: v } })}
          />
          <AdminToggle
            icon="alert-circle-outline"
            label="Hata defterine yazma"
            description="Kapatınca yanlışlar tekrar listesine eklenmez."
            value={settings.featureFlags.mistakes}
            onValueChange={v => patchSettings({ featureFlags: { ...settings.featureFlags, mistakes: v } })}
          />
          <AdminToggle
            icon="checkmark-done-outline"
            label="Konu ‘çalıştım’ işareti"
            value={
              settings.featureFlags.topicProgress
            }
            onValueChange={v =>
              patchSettings({ featureFlags: { ...settings.featureFlags, topicProgress: v } })
            }
          />
          <AdminToggle
            icon="person-add-outline"
            label="Yeni hesap açılışı"
            description="Kapalıyken panelde yeni kullanıcı kaydı oluşturulamaz."
            value={settings.registrationOpen}
            onValueChange={v => patchSettings({ registrationOpen: v })}
          />
        </AdminCard>

        {/* Defaults */}
        <AdminSectionTitle
          label="Varsayılanlar"
          hint="Kullanıcı kendi ayarını değiştirmediği sürece bu değerler geçerli"
        />
        <AdminCard>
          <AdminSegmented
            label="Uygulama teması"
            value={settings.defaultTheme}
            onChange={id => patchSettings({ defaultTheme: id as ThemePreference })}
            options={[
              { id: 'system', label: 'Sistem' },
              { id: 'light', label: 'Açık' },
              { id: 'dark', label: 'Koyu' },
            ]}
          />
          <AdminStepper
            label="Günlük hedef"
            value={settings.dailyGoalDefault}
            min={10}
            max={500}
            step={10}
            onChange={v => patchSettings({ dailyGoalDefault: v })}
            suffix="soru"
          />
          <AdminStepper
            label="Test başına soru"
            description="Konu testlerinin bölünme büyüklüğü."
            value={settings.quizDefaults.questionCount}
            min={5}
            max={100}
            step={5}
            onChange={v =>
              patchSettings({ quizDefaults: { ...settings.quizDefaults, questionCount: v } })
            }
          />
          <AdminToggle
            icon="shuffle"
            label="Test sorularını karıştır"
            value={settings.quizDefaults.shuffleQuestions}
            onValueChange={v =>
              patchSettings({ quizDefaults: { ...settings.quizDefaults, shuffleQuestions: v } })
            }
          />
          <AdminField
            label="Sınav tarihi override"
            value={settings.examDateOverride || ''}
            onChangeText={t => patchSettings({ examDateOverride: t.trim() || null })}
            placeholder="yyyy-aa-gg — boş: preset kullanılır"
            hint="Dolduğunda ana ekrandaki geri sayım tüm kullanıcılar için bu tarihi baz alır."
          />
        </AdminCard>

        {/* Security */}
        <AdminSectionTitle label="Güvenlik" hint="Panele erişim PIN’i" />
        <AdminCard pad={4}>
          <AdminRow
            compact
            icon="key-outline"
            title="PIN kodu"
            subtitle={
              admin.pinIsDefault
                ? 'Varsayılan PIN kullanılıyor — değiştirmen önerilir'
                : 'Özel PIN aktif'
            }
            right={<AdminChip label={admin.pinIsDefault ? 'Varsayılan' : 'Güvenli'} tone={admin.pinIsDefault ? 'warning' : 'success'} compact />}
            onPress={() => {
              setPinDraft('');
              setPinConfirm('');
              setPinError(null);
              setPinSheet(true);
            }}
          />
          <AdminRow
            compact
            icon="lock-closed-outline"
            title="Oturumu kilitle"
            subtitle="Panel girişi 15 dakika sonra otomatik kilitlenir"
            right={<AdminChip label={admin.unlocked ? 'Açık' : 'Kilitli'} tone={admin.unlocked ? 'success' : 'danger'} compact />}
            onPress={admin.lock}
          />
        </AdminCard>

        {/* Data */}
        <AdminSectionTitle label="Veri" hint="Yedeğini al, başka cihaza taşı" />
        <AdminCard>
          <View style={styles.dataRow}>
            <AdminButton
              small
              tone="neutral"
              icon="download-outline"
              label="JSON dışa aktar"
              onPress={() => setDataSheet('export')}
              flex
            />
            <AdminButton
              small
              tone="neutral"
              icon="document-attach-outline"
              label="JSON içe aktar"
              onPress={() => {
                setImportDraft('');
                setImportMsg(null);
                setDataSheet('import');
              }}
              flex
            />
          </View>
          <View style={styles.dataRow}>
            <AdminButton
              small
              tone="ghost"
              icon="refresh-outline"
              label="Canlı içeriği yenile"
              onPress={() => app.refreshAllCourses()}
              flex
            />
            <AdminButton
              small
              tone="danger"
              icon="trash-outline"
              label="Yerel düzenlemeleri sil"
              onPress={() => setConfirm('content')}
              flex
            />
          </View>
          <Text style={[styles.dataHint, { color: colors.textMuted }]}>
            Son kayıt: {admin.state.savedAt ? new Date(admin.state.savedAt).toLocaleString('tr-TR') : '—'}
          </Text>
        </AdminCard>

        <AdminSectionTitle label="Tehlikeli bölge" />
        <AdminCard>
          <AdminButton
            label="Tüm yönetim verisini sıfırla"
            tone="danger"
            icon="alert-circle-outline"
            onPress={() => setConfirm('all')}
            style={{ alignSelf: 'stretch' }}
          />
          <Text style={[styles.dataHint, { color: colors.textMuted }]}>
            İçerik override’ları, kullanıcı kayıtları, ayarlar ve işlem geçmişi silinir.
          </Text>
        </AdminCard>
      </AdminGate>

      {/* PIN sheet */}
      <AdminSheet
        visible={pinSheet}
        title="PIN kodunu değiştir"
        onClose={() => setPinSheet(false)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setPinSheet(false)} flex />
            <AdminButton
              label="Kaydet"
              icon="checkmark"
              onPress={() => {
                if (pinDraft.length < 4) {
                  setPinError('En az 4 haneli bir kod gir.');
                  return;
                }
                if (pinDraft !== pinConfirm) {
                  setPinError('Kodlar eşleşmedi.');
                  return;
                }
                admin.setPin(pinDraft);
                setPinSheet(false);
              }}
              flex
            />
          </>
        }
      >
        <AdminField
          label="Yeni PIN"
          value={pinDraft}
          onChangeText={t => setPinDraft(t.replace(/\D/g, '').slice(0, 8))}
          keyboardType="numeric"
          maxLength={8}
          hint="4-8 hane. Bu PIN yalnızca bu cihazda saklanır."
        />
        <AdminField
          label="Yeni PIN (tekrar)"
          value={pinConfirm}
          onChangeText={t => setPinConfirm(t.replace(/\D/g, '').slice(0, 8))}
          keyboardType="numeric"
          maxLength={8}
        />
        {!!pinError && (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color={colors.danger} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}>{pinError}</Text>
          </View>
        )}
      </AdminSheet>

      {/* Export / import */}
      <AdminSheet
        visible={dataSheet === 'export'}
        title="Yedek (JSON)"
        onClose={() => setDataSheet(null)}
        footer={<AdminButton label="Kapat" tone="neutral" onPress={() => setDataSheet(null)} flex />}
      >
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8, lineHeight: 17 }}>
          Hepsini seç-kopyala: içeriği düzenleyip “JSON içe aktar” ile geri yükleyebilirsin.
        </Text>
        <ScrollView style={styles.codeBox} keyboardShouldPersistTaps="handled">
          <Text selectable style={[styles.code, { color: colors.textSecondary }]}>
            {admin.exportJson().slice(0, 20000)}
          </Text>
        </ScrollView>
      </AdminSheet>

      <AdminSheet
        visible={dataSheet === 'import'}
        title="Yedekten yükle"
        onClose={() => setDataSheet(null)}
        footer={
          <>
            <AdminButton label="Vazgeç" tone="neutral" onPress={() => setDataSheet(null)} flex />
            <AdminButton
              label="Yükle"
              tone="danger"
              icon="upload-outline"
              disabled={!importDraft.trim()}
              onPress={() => {
                const res = admin.importJson(importDraft);
                if (res.ok) {
                  setDataSheet(null);
                  app.refreshAllCourses();
                } else {
                  setImportMsg(res.error || 'Dosya okunamadı.');
                }
              }}
              flex
            />
          </>
        }
      >
        <AdminField
          label="JSON içeriği"
          value={importDraft}
          onChangeText={setImportDraft}
          multiline
          placeholder='{"content": … }'
          hint={importMsg || 'Tüm alanları geçerli bir AdminState JSON’u olacak şekilde yapıştır.'}
        />
      </AdminSheet>

      <AdminConfirm
        visible={confirm === 'content'}
        title="Yerel düzenlemeleri sil"
        confirmLabel="Sil"
        message="Konu, soru ve hap bilgi override’ları silinir; canlı içerik geri gelir. Kullanıcılar ve ayarlar korunur."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          Object.keys(admin.state.content.topics).forEach(id =>
            admin.restoreCourseTopics(id as any)
          );
          await admin.restoreTips();
          await app.refreshAllCourses();
        }}
      />

      <AdminConfirm
        visible={confirm === 'all'}
        title="Tüm yönetim verisini sıfırla"
        confirmLabel="Kalıcı olarak sil"
        message="Bu işlem geri alınamaz: içerik düzenlemeleri, kullanıcı listesi, ayarlar ve işlem geçmişi silinir."
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await admin.resetAllContent();
        }}
      />
    </AdminScaffold>
  );
};

const styles = StyleSheet.create({
  dataRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dataHint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  codeBox: { maxHeight: 260, marginBottom: 6 },
  code: {
    fontFamily: 'monospace',
    fontSize: 10.5,
    lineHeight: 15,
  },
});
