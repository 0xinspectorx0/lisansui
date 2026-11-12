import React, { useState } from 'react';
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
import { useAdmin } from '../lib/AdminContext';
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

export const AdminSettingsScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const admin = useAdmin();
  const app = useApp();
  const { settings, patchSettings } = admin;
  const membershipPolicy = settings.membership;

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
            subtitle="Kayıtlar ve panel listesi bu yolu kullanır"
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
  dataRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dataHint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  codeBox: { maxHeight: 260, marginBottom: 6 },
  code: {
    fontFamily: 'monospace',
    fontSize: 10.5,
    lineHeight: 15,
  },
});
