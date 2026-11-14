/**
 * Membership provider — accounts, VIP entitlements and the free-quota gate.
 *
 * All membership state is stored in Supabase (`memberships/{memberId}`); this
 * provider is the only place that reads/writes it, keeps a local session, and
 * answers "may this device start another test?".
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CourseId, TestResult, TopicMeta } from './types';
import { setLocalMemberId } from './AppContext';
import {
  MemberDoc,
  QuotaState,
  VipPlanId,
  canStartTest,
  countCourseTests,
  emptyMember,
  expiryForPlan,
  isVipActive,
  normalizeEmail,
  remainingTests,
  validateMembership,
} from './membership';
import { AUTH_PASSWORD_BUNDLE, hashPassword, isCloudAuthBundle, verifyPassword } from './crypto';
import { consumeApiKeyParamNotice, consumeTokenRefreshNotice } from './cloudApi';
import * as auth from './authClient';
import {
  CloudOutcome,
  deleteMemberDoc,
  fetchMemberByEmail,
  fetchMemberDoc,
  listMembers,
  patchMemberDoc,
  upsertMemberDoc,
  writeMembershipSelf,
} from './cloudApi';
import { setTestCompletionListener, useApp } from './AppContext';
import { useAdmin } from './AdminContext';
import { bindMember, resetUserDataStatus } from './userDataSync';

const SESSION_KEY = '@kpss_session_member_v1';
const MEMBER_CACHE_KEY = '@kpss_member_cache_v1';

/**
 * Cihaz önbelleği YALNIZ kimlik ipucu taşır.
 *
 * Hak/sayaç alanları (vip, vipPlan, vipExpiresAt, testsCompleted, courseUsage,
 * status) kasıtlı olarak yazılmaz: offline önbelleği düzenleyerek VIP
 * çoğaltılamaz, bayat değer de ekranda hak gibi görünmez. Bulut erişilemezse
 * kullanıcı yalnız "giriş yapılmış" bilgisini görür, hak bilgisi için satır
 * beklenir. Doğru/tek kaynak Supabase'deki `members` satırıdır.
 */
function memberCacheStub(next: MemberDoc | null): string {
  if (!next) return '';
  return JSON.stringify({
    id: next.id,
    email: next.email,
    displayName: next.displayName,
    authUid: next.authUid || '',
  });
}

export type CloudStatus = 'unknown' | 'online' | 'offline' | 'denied';

interface MembershipContextValue {
  ready: boolean;
  member: MemberDoc | null;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  cloudStatus: CloudStatus;
  cloudMessage: string | null;

  /** true ise kimlik doğrulama Supabase Auth üzerinden yapılır (anahtar depoda/.env’de tanımlı). */
  authMode: boolean;
  /** Supabase Auth açıkken “şifremi unuttum” e-postası. */
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** E-posta doğrulama mailini tekrar gönderir. */
  resendConfirmation: (email: string) => Promise<{ ok: boolean; error?: string }>;
  /** Şifre sıfırlama bağlantısından gelindiğinde yeni şifreyi kaydeder. */
  completePasswordRecovery: (newPassword: string) => Promise<{ ok: boolean; email?: string; error?: string }>;

  quota: QuotaState;
  /** Effective VIP: cloud member doc (or admin local profile when cloudVip is off). */
  isVip: boolean;
  vipSource: 'cloud' | 'local-admin' | 'none';

  clearError: () => void;
  signUp: (input: { email: string; password: string; displayName: string; city?: string; exam?: string }) => Promise<{ ok: boolean; reason?: string; confirmationRequired?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<MemberDoc, 'displayName' | 'city' | 'exam' | 'note'>>) => Promise<{ ok: boolean; reason?: string }>;
  changePassword: (current: string, next: string) => Promise<{ ok: boolean; reason?: string }>;
  deleteAccount: (password: string) => Promise<{ ok: boolean; reason?: string }>;

  usedFor: (courseId: CourseId | 'genel', topics?: TopicMeta[]) => number;
  remainingFor: (courseId: CourseId | 'genel', topics?: TopicMeta[]) => number;
  canStart: (courseId: CourseId | 'genel', topics?: TopicMeta[]) => boolean;
  /** True when every course still has quota (karma/mixed exams). */
  /** Karma exam needs both: its own slot and at least one course with quota. */
  canStartMixed: (catalog: Record<CourseId, TopicMeta[]>) => boolean;
  /** Called after a test is finished so the cloud counters stay current. */
  reportTestCompleted: (courseId: CourseId | 'genel', result: { total: number; correct: number; wrong: number }) => void;

  restoreFromCloud: () => Promise<{ ok: boolean; restored: number; reason?: string }>;
  /** Usage counted on this device for the signed-in member (push it with syncUsageToCloud). */
  localUsageSnapshot: () => {
    courseUsage: Record<string, number>;
    testsCompleted: number;
    questionsSolved: number;
    netSum: number;
  };
  /** Pushes locally-observed counters (tests per course, solved questions) to the member doc. */
  syncUsageToCloud: (usage: { courseUsage: Record<string, number>; testsCompleted: number; questionsSolved: number }) => Promise<{ ok: boolean; reason?: string }>;

  // admin-facing
  adminListMembers: () => Promise<{ members: MemberDoc[]; limited: boolean; error?: string }>;
  adminUpsertMember: (member: MemberDoc) => Promise<CloudOutcome<MemberDoc>>;
  adminSetVip: (memberId: string, plan: VipPlanId) => Promise<CloudOutcome<true>>;
  adminSetStatus: (memberId: string, status: MemberDoc['status']) => Promise<CloudOutcome<true>>;
  /** Rol değişimi de buluta gider (RLS: yalnız yönetici PATCH'leyebilir). */
  adminSetRole: (memberId: string, role: MemberDoc['role']) => Promise<CloudOutcome<true>>;
  adminDeleteMember: (memberId: string) => Promise<CloudOutcome<true>>;
  membersVersion: number;
}

const MembershipContext = createContext<MembershipContextValue | null>(null);

/** AsyncStorage on web, SecureStore on native (never blocks the bundle on web). */
const sessionStore = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    try {
      const SecureStore = require('expo-secure-store');
      return await SecureStore.getItemAsync(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    try {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    try {
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  },
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Pseudo profile id used while nobody is signed in (keeps guest quota on-device). */
const GUEST_PROFILE = 'device:guest';

export const MembershipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { catalog, results, updateResultsWithMember } = useApp();
  const admin = useAdmin();
  const membershipCfg = admin.settings.membership;

  const [ready, setReady] = useState(false);
  const [member, setMember] = useState<MemberDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('unknown');
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [membersVersion, setMembersVersion] = useState(0);
  const memberRef = useRef<MemberDoc | null>(null);
  memberRef.current = member;

  const applyMember = useCallback((next: MemberDoc | null) => {
    memberRef.current = next;
    setMember(next);
    // Device profile identity drives which result rows count against the quota.
    setLocalMemberId(next ? next.id : GUEST_PROFILE);
    if (next) AsyncStorage.setItem(MEMBER_CACHE_KEY, memberCacheStub(next)).catch(() => {});
    else AsyncStorage.removeItem(MEMBER_CACHE_KEY).catch(() => {});
    // Kullanıcı verisi eşleyicisi oturuma bağlanır: satır yazılırken
    // `userId = auth.uid` politikası bu kimliği kullanır. Çıkışta bağ kopar.
    if (next) bindMember({ email: next.email || next.id, userId: next.authUid || '' });
    else {
      bindMember(null);
      resetUserDataStatus();
    }
  }, []);

  const reportRef = useRef<MembershipContextValue['reportTestCompleted'] | null>(null);
  const adminRef = useRef<ReturnType<typeof useAdmin> | null>(null);
  adminRef.current = admin;

  const noteCloud = useCallback((res: { ok: boolean; error?: string; reason?: string }) => {
    // Kendi kendine iyileşen üç durum: (a) cihazda yabancı projeli anahtar,
    // (b) isteklerin web API anahtarı parametresi istemesi, (c) bayat oturum
    // token'ı. Biri yaşandıysa kullanıcıya "ne oldu" tek cümleyle söylenir.
    const healedKey = consumeApiKeyParamNotice();
    const healedToken = auth.consumeForeignTokenNotice();
    const healedRefresh = consumeTokenRefreshNotice();
    if (res.ok) {
      setCloudStatus('online');
      setCloudMessage(
        healedKey
          ? 'Supabase istekleri artık web API anahtarı parametresiyle gönderiliyor — anahtarsız istekler geçit tarafından reddediliyormuş, kendiliğinden düzeltildi.'
          : healedToken
            ? 'Cihazda kayıtlı eski Supabase anahtarı başka bir projeye aitmiş; kaldırıldı, depodaki anahtar kullanılıyor.'
            : healedRefresh
              ? 'Oturum tokenın bayattı — yenilenip aynı yazma gönderildi, işlem baştan denenmedi.'
              : null
      );
      return;
    }
    setCloudStatus(res.reason === 'denied' ? 'denied' : 'offline');
    setCloudMessage(res.error || 'Supabase işlemi başarısız');
  }, []);

  // Keep the admin panel's device row and the cloud document in step with real usage.
  useEffect(() => {
    setTestCompletionListener((courseId, summary) => {
      reportRef.current?.(courseId, summary);
      adminRef.current?.addLocalUsage(courseId, summary);
    });
    return () => setTestCompletionListener(null);
  }, []);

  /* ------------------------------------------------------------- restore */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Depoya gömülü config (+ eski kurulumlarda cihaz anahtarı) ve kalıcı oturum:
        // ilk Supabase isteğinin Authorization başlığıyla gitmesi için önce yükle.
        await auth.ensureAuthConfigLoaded();
        await auth.currentIdToken().catch(() => null);
        // Cihazda kalmış eski anahtar BAŞKA projeden token veriyorsa tüm Supabase
        // istekleri reddedilir. Fark edildiği anda temizlenir — kullanıcıdan bir şey
        // istenmez, sonraki açılış/istek depodaki doğru config ile gider.
        const healed = await auth.healForeignAuthProject().catch(() => ({ healed: false as const }));
        if (healed.healed) {
          await sessionStore.remove(SESSION_KEY);
          applyMember(null);
          setCloudStatus('online');
          setCloudMessage(
            'Cihazda kayıtlı kimlik başka bir Supabase projesine aitti; temizlendi. Yeniden giriş yapman yeterli.'
          );
        }
        const cached = await AsyncStorage.getItem(MEMBER_CACHE_KEY);
        const id = await sessionStore.get(SESSION_KEY);
        if (cached && !id) {
          // session removed elsewhere -> drop the cache
          await AsyncStorage.removeItem(MEMBER_CACHE_KEY);
        }
        if (id) {
          if (cached) {
            try {
              // Stub'tan doldur: kimlik görünür, haklar buluttan gelince eklenir.
              const stub = JSON.parse(cached) as Partial<MemberDoc>;
              if (stub && stub.id) applyMember({ ...emptyMember(String(stub.id)), ...stub } as MemberDoc);
            } catch {
              /* ignore malformed cache */
            }
          }
          // Pull the authoritative doc (admin may have changed VIP meanwhile).
          const res = await fetchMemberDoc(id);
          if (cancelled) return;
          if (res.ok) {
            if (res.data) {
              if (res.data.status === 'banned' || res.data.status === 'suspended') {
                await sessionStore.remove(SESSION_KEY);
                applyMember(null);
                setCloudMessage(
                  res.data.status === 'banned'
                    ? 'Hesabın yasaklandı. Yönetici ile iletişime geç.'
                    : 'Hesabın askıya alındı.'
                );
                setCloudStatus('online');
              } else {
                applyMember(res.data);
                setCloudStatus('online');
              }
            } else {
              // Document deleted by the admin -> sign out locally.
              await sessionStore.remove(SESSION_KEY);
              applyMember(null);
              setCloudStatus('online');
              setCloudMessage('Üyelik kaydın bulutta bulunamadı, çıkış yapıldı.');
            }
          } else {
            setCloudStatus(res.reason === 'denied' ? 'denied' : 'offline');
            setCloudMessage(res.error || null);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMember]);

  /* ----------------------------------------------------------- entitlements */

  const localAdminUser = admin.localUser;
  const cloudVip = isVipActive(member);

  const isVip = useMemo(() => {
    if (!membershipCfg.cloudVip) return localAdminUser.vip && localAdminUser.status === 'active';
    return cloudVip || (admin.unlocked && localAdminUser.vip);
  }, [admin.unlocked, cloudVip, localAdminUser.status, localAdminUser.vip, membershipCfg.cloudVip]);

  const vipSource: MembershipContextValue['vipSource'] = membershipCfg.cloudVip
    ? cloudVip
      ? 'cloud'
      : admin.unlocked && localAdminUser.vip
      ? 'local-admin'
      : 'none'
    : localAdminUser.vip
    ? 'local-admin'
    : 'none';

  const quota = useMemo<QuotaState>(
    () => ({
      enforced: membershipCfg.enforce,
      freeTestsPerCourse: Math.max(0, membershipCfg.freeTestsPerCourse),
      isVip,
    }),
    [isVip, membershipCfg.enforce, membershipCfg.freeTestsPerCourse]
  );

  /* --------------------------------------------------------------- actions */

  const clearError = useCallback(() => setError(null), []);

  /**
   * Reddedilen üyelik yazımının NEDENİNİ sorar ve tek cümle + ilk adımla döner.
   * (Boş bir “kural engelledi” uyarısı yerine ne yapacağını söyler.)
   */
  /**
   * Reddedilen bulut yazımının TEK cümlesi. Neden gelen yanıttan alınır — ayrı
   * bir “teşhis” turu YOK (fazladan istek, okunacak rapor, kopyalanacak metne
   * gerek yok). Yazma anlıktır ve cihazda kopya bekletilmediği için mesaj yalnız
   * olanı söyler: ne oldu, kim neyi düzeltince tekrar denenebilir.
   */
  const membershipDeniedMessage = useCallback((detail?: string) => {
    const why = String(detail || '')
      .replace(/^Supabase HTTP \d+:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    return `Buluta yazılamadı${why ? `: ${why.slice(0, 180)}` : ''}. Üyelik açılmadı — cihazda kopya bekletilmiyor; engel kalkınca “Üye ol”a tekrar bas.`;
  }, []);


  const signUp = useCallback<MembershipContextValue['signUp']>(
    async input => {
      setError(null);
      const email = input.email.trim();
      const emailKey = normalizeEmail(email);
      if (!emailPattern.test(email)) {
        setError('Geçerli bir e-posta adresi gir.');
        return { ok: false, reason: 'email' };
      }
      if ((input.password || '').length < 6) {
        setError('Parola en az 6 karakter olmalı.');
        return { ok: false, reason: 'password' };
      }
      if (!input.displayName.trim()) {
        setError('Ad soyad zorunlu.');
        return { ok: false, reason: 'name' };
      }
      if (!admin.settings.registrationOpen) {
        setError('Yeni kayıtlar yönetim tarafından kapatıldı.');
        return { ok: false, reason: 'closed' };
      }
      await auth.ensureAuthConfigLoaded();
      const authMode = auth.isAuthConfigured();
      setBusy(true);
      try {
        let authUid = '';
        let confirmationRequired = false;
        if (authMode) {
          // Kimlik Supabase Auth'ta: önce hesabı aç, sonra üyelik belgesini yaz.
          let account = await auth.signUp(emailKey, input.password, {
            displayName: input.displayName.trim(),
            city: input.city?.trim() || '',
            exam: input.exam?.trim() || 'KPSS Lisans (GY-GK)',
          });
          if (!account.ok && /kayıtlı bir hesap var|already registered|already been registered/i.test(account.error || '')) {
            // Önceki deneme yarım kalmış olabilir (Auth hesabı açıldı, satır
            // yazılamadı). Şifre bilindiği için hesabı silmek yerine GİRİŞ yapılır
            // ve kayıt kaldığı yerden tamamlanır — kullanıcıya iş çıkmaz.
            account = await auth.signIn(emailKey, input.password);
            if (account.ok) setCloudMessage('Hesabın zaten açıktı; giriş yapıldı ve üyelik tamamlanıyor.');
          }
          if (!account.ok) {
            setError(account.error || 'Kayıt başarısız.');
            return { ok: false, reason: 'auth' };
          }
          confirmationRequired = Boolean(account.confirmationRequired);
          authUid = account.session?.uid || '';
          // Açılan hesap Supabase hedefinin projesinden mi? Değilse belge yazımı
          // 401/403 alır; hesabı geri al + cihazdaki eski anahtarı sil.
          if (!confirmationRequired && (await auth.isForeignSessionToken())) {
            await auth.deleteAccount().catch(() => undefined);
            const healed = await auth.healForeignAuthProject().catch(() => ({ healed: false }));
            setError(
              healed.healed
                ? 'Kayıt geri alındı: cihazda kayıtlı eski Supabase anahtarı başka bir projeye aitmiş, o kayıt silindi. Şimdi tekrar “Üye ol” diyebilirsin.'
                : 'Kayıt geri alındı: oturum başka bir Supabase projesine ait. Geliştirici işi — `config/supabaseApp.ts` (yoksa .env.local) ve app.json → expo.extra.supabase.url aynı projeyi göstermeli.'
            );
            return { ok: false, reason: 'auth' };
          }
        } else {
          const existing = await fetchMemberByEmail(emailKey);
          if (existing.ok && existing.data) {
            setError('Bu e-posta ile kayıtlı bir üye var. Giriş yapmayı dene.');
            return { ok: false, reason: 'exists' };
          }
          if (!existing.ok && existing.reason !== 'notfound' && existing.reason !== 'denied' && existing.reason !== 'offline') {
            // Lookup failed for another reason — block creation to avoid duplicates.
            setError(existing.error);
            noteCloud(existing);
            return { ok: false, reason: 'lookup' };
          }
          if (!existing.ok && existing.reason === 'offline') {
            setError('Supabase’e ulaşılamadı. İnternet bağlantınla üye olman gerekiyor.');
            noteCloud(existing);
            return { ok: false, reason: 'offline' };
          }
        }
        const sec = authMode ? AUTH_PASSWORD_BUNDLE : hashPassword(input.password);
        const now = new Date().toISOString();
        const trial = Math.max(0, membershipCfg.defaultTrialDays);
        const draft: MemberDoc = {
          ...emptyMember(emailKey),
          // Belge id'si normalize e-posta olduğu için alanı da normalize tutuyoruz;
          // SQL kısıtı (`members_id_is_email`) `id = email` eşitliğini denetliyor.
          email: emailKey,
          emailNormalized: emailKey,
          ...(authUid ? { authUid } : {}),
          displayName: input.displayName.trim(),
          password: sec,
          city: input.city?.trim() || '',
          exam: input.exam?.trim() || 'KPSS Lisans (GY-GK)',
          status: membershipCfg.requireApproval ? 'pending' : 'active',
          vip: trial > 0,
          vipPlan: trial > 0 ? 'monthly' : 'free',
          vipExpiresAt: trial > 0 ? expiryForPlan('monthly') : '',
          createdAt: now,
          lastLoginAt: now,
          note: trial > 0 ? `${trial} gün deneme VIP verildi.` : '',
        };
        // Kademeli yazma: tam biçim create → belge zaten varsa benimseniyor →
        // create reddedilirse kuralın kabul ettiği alanlarla kısmi yazım.
        const created = await writeMembershipSelf(draft);
        if (!created.ok) {
          // E-posta onayı beklenirken satır daha önce yazılmışsa veya oturum
          // onaydan sonra açılacaksa kullanıcıyı engelleme; ilk girişte tamamlanır.
          if (confirmationRequired) {
            setCloudStatus('online');
            return { ok: true, confirmationRequired: true };
          }
          // Üyelik VERİSİ cihazda tutulmaz: satır yazılamadıysa kayıt YOKTUR.
          // Supabase Auth hesabı istemciden silinemez (service_role gerekir);
          // oturum kapatılır, tekrar deneme aynı hesapla giriş üzerinden tamamlanır.
          if (authMode) await auth.deleteAccount().catch(() => undefined);
          noteCloud(created);
          setError(
            created.reason === 'denied'
              ? membershipDeniedMessage(created.error)
              : created.error
          );
          return { ok: false, reason: 'write' };
        }
        if (confirmationRequired) {
          setCloudStatus('online');
          setMembersVersion(v => v + 1);
          return { ok: true, confirmationRequired: true };
        }
        if (created.adopted || created.degraded) {
          // Belge zaten varmış: yazma kabul edilen alanlarla güncellendi, hesap bağlandı.
          setCloudMessage(
            'Bu e-postada üyelik belgesi zaten vardı; hesabın Supabase Auth’a bağlandı ve belge güncellendi.'
          );
        }
        applyMember(created.data);
        await sessionStore.set(SESSION_KEY, created.data.id);
        setCloudStatus('online');
        setCloudMessage(
          created.data?.status === 'pending'
            ? 'Üyeliğin oluşturuldu ve Supabase’e yazıldı; durum: ONAY BEKLİYOR. Yönetici onaylayınca VIP/kota hakların açılır.'
            : null
        );
        setMembersVersion(v => v + 1);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [admin.settings.registrationOpen, applyMember, membershipCfg, noteCloud]
  );

  const signIn = useCallback<MembershipContextValue['signIn']>(
    async (email, password) => {
      setError(null);
      const emailKey = normalizeEmail(email);
      if (!emailPattern.test(emailKey)) {
        setError('Geçerli bir e-posta adresi gir.');
        return { ok: false, reason: 'email' };
      }
      await auth.ensureAuthConfigLoaded();
      let authMode = auth.isAuthConfigured();
      setBusy(true);
      try {
        let authUid = '';
        let authMeta: { displayName?: string; city?: string; exam?: string } | undefined;
        if (authMode) {
          const account = await auth.signIn(emailKey, password);
          if (!account.ok) {
            // Supabase anahtarı sonradan eklendiyse eski üyelerin Supabase hesabı
            // yoktur (belgede yerel PBKDF2 hash’i durur). Parolayı yerel hash ile
            // doğrulayıp üyeliği içeri alıyoruz — kimse dışarıda kalmıyor.
            const legacy = account.code === 'EMAIL_NOT_FOUND' ? await fetchMemberByEmail(emailKey) : null;
            const legacyDoc = legacy?.ok ? legacy.data : null;
            const legacyOk =
              !!legacyDoc && !isCloudAuthBundle(legacyDoc.password) && verifyPassword(password, legacyDoc.password);
            if (!legacyOk) {
              setError(legacyDoc && !isCloudAuthBundle(legacyDoc.password) ? 'Mevcut parola hatalı.' : account.error || 'Giriş başarısız.');
              return { ok: false, reason: 'auth' };
            }
            authMode = false;
          } else {
            authUid = account.session?.uid || '';
            authMeta = account.session?.userMetadata;
          }
        }
        const found = await fetchMemberByEmail(emailKey);
        // Katı modda (meta/membership_lockdown) henüz OLMAYAN belge 404 değil 403
        // döner: kurallar eksik belgede `resource.data.email` okuyamaz. Auth modunda
        // bunu “belge yok” sayıp ilk girişte oluşturmayı deniyoruz; selfCreateOk bunu
        // zaten izin veriyor (yol == oturum e-postası).
        const missingDoc =
          !found.ok && authMode && (found.reason === 'notfound' || found.reason === 'denied');
        if (!found.ok && !missingDoc) {
          noteCloud(found);
          if (found.reason === 'offline')
            setError('Supabase’e ulaşılamadı — üyelik verisi cihazda tutulmadığı için çevrimdışı giriş yok. Bağlanınca tekrar dene.');
          else if (found.reason === 'denied')
            setError(membershipDeniedMessage(found.error));
          else setError(found.error);
          return { ok: false, reason: found.reason };
        }
        const doc = found.ok ? found.data : null;
        if (!doc) {
          if (!authMode) {
            setError('Bu e-posta ile kayıtlı üye bulunamadı.');
            return { ok: false, reason: 'notfound' };
          }
          // Supabase hesabı var, üyelik belgesi yok (ör. e-posta onayı sonrası ilk giriş) → oluştur.
          const nowIso = new Date().toISOString();
          const draft: MemberDoc = {
            ...emptyMember(emailKey),
            email: emailKey,
            emailNormalized: emailKey,
            displayName: authMeta?.displayName || emailKey.split('@')[0] || 'Üye',
            city: authMeta?.city || '',
            exam: authMeta?.exam || 'KPSS Lisans (GY-GK)',
            password: AUTH_PASSWORD_BUNDLE,
            ...(authUid ? { authUid } : {}),
            status: membershipCfg.requireApproval ? 'pending' : 'active',
            createdAt: nowIso,
            lastLoginAt: nowIso,
            note: 'Supabase Auth hesabıyla ilk girişte oluşturuldu.',
          };
          const created = await writeMembershipSelf(draft);
          if (!created.ok) {
            noteCloud(created);
            setError(created.error);
            return { ok: false, reason: created.reason };
          }
          applyMember(created.data);
          await sessionStore.set(SESSION_KEY, created.data.id);
          setCloudStatus('online');
          setCloudMessage(null);
          setMembersVersion(v => v + 1);
          return { ok: true };
        }
        if (!authMode) {
          if (isCloudAuthBundle(doc.password)) {
            setError(
              'Bu hesap Supabase Auth ile oluşturulmuş. Anahtar `config/supabaseApp.ts` içine yazılınca (geliştirici işi) giriş kendiliğinden çalışır — senden bir şey girmen istenmiyor.'
            );
            return { ok: false, reason: 'authmode' };
          }
          if (!verifyPassword(password, doc.password)) {
            setError('Parola hatalı.');
            return { ok: false, reason: 'password' };
          }
        }
        if (doc.status === 'banned' || doc.status === 'suspended') {
          setError(
            doc.status === 'banned'
              ? 'Hesabın yasaklandı. Yönetici ile iletişime geç.'
              : 'Hesabın askıya alındı. Yönetici onayı gerekiyor.'
          );
          return { ok: false, reason: doc.status };
        }
        // Onay bekleyen üye KAPIDAN DÖNMEZ: içeri girer, ücretsiz kotasını
        // kullanır ve durumunu görür; VIP/kota hakkı onayla açılır (isVipActive
        // `pending`i dışlıyor). Böylece "üyelik aktif değil" kuralı hem ara
        // yüzde hem hakedişte aynı şeyi söyler.
        if (doc.status === 'pending') setCloudMessage('Üyeliğin yönetim onayında — onaylanana kadar yalnız ücretsiz haklar geçerli.');
        const stamp: Partial<MemberDoc> = {
          lastLoginAt: new Date().toISOString(),
          ...(authUid && doc.authUid !== authUid ? { authUid } : {}),
        };
        const patched = await patchMemberDoc(doc.id, stamp);
        applyMember(patched.ok && patched.data ? patched.data : { ...doc, ...stamp });
        await sessionStore.set(SESSION_KEY, doc.id);
        setCloudStatus('online');
        setCloudMessage(null);
        setMembersVersion(v => v + 1);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [applyMember, membershipCfg.requireApproval, noteCloud]
  );

  const signOut = useCallback(async () => {
    applyMember(null);
    await sessionStore.remove(SESSION_KEY);
    if (auth.isAuthConfigured()) await auth.signOut();
    setError(null);
  }, [applyMember]);

  const sendPasswordReset = useCallback<MembershipContextValue['sendPasswordReset']>(
    async email => {
      if (!auth.isAuthConfigured())
        return { ok: false, error: 'Parola sıfırlama için Supabase Auth gerekiyor (anahtar config/supabaseApp.ts içinde tanımlı olmalı).' };
      const clean = normalizeEmail(email);
      if (!emailPattern.test(clean)) {
        const msg = 'Lütfen geçerli bir e-posta adresi girin.';
        setError(msg);
        return { ok: false, error: msg };
      }
      const res = await auth.sendPasswordResetEmail(clean);
      if (!res.ok) {
        setError(res.error || 'Sıfırlama e-postası gönderilemedi.');
        return { ok: false, error: res.error };
      }
      setError(null);
      return { ok: true };
    },
    []
  );

  const resendConfirmation = useCallback<MembershipContextValue['resendConfirmation']>(
    async email => {
      if (!auth.isAuthConfigured())
        return { ok: false, error: 'E-posta doğrulama için Supabase Auth gerekiyor.' };
      const clean = normalizeEmail(email);
      if (!emailPattern.test(clean)) {
        const msg = 'Lütfen geçerli bir e-posta adresi girin.';
        setError(msg);
        return { ok: false, error: msg };
      }
      const res = await auth.resendConfirmationEmail(clean);
      if (!res.ok) {
        setError(res.error || 'Onay e-postası gönderilemedi.');
        return { ok: false, error: res.error };
      }
      setError(null);
      return { ok: true };
    },
    []
  );

  const completePasswordRecovery = useCallback<MembershipContextValue['completePasswordRecovery']>(
    async newPassword => {
      setError(null);
      if ((newPassword || '').length < 6) {
        const msg = 'Yeni parola en az 6 karakter olmalı.';
        setError(msg);
        return { ok: false, error: msg };
      }
      setBusy(true);
      try {
        const session = await auth.currentSession();
        const res = await auth.updatePassword(newPassword);
        if (!res.ok) {
          setError(res.error || 'Yeni parola kaydedilemedi.');
          return { ok: false, error: res.error };
        }
        const email = session?.email || '';
        applyMember(null);
        await sessionStore.remove(SESSION_KEY);
        await auth.signOut();
        return { ok: true, email };
      } finally {
        setBusy(false);
      }
    },
    [applyMember]
  );

  const refreshMember = useCallback(async () => {
    const id = memberRef.current?.id;
    if (!id) return;
    const res = await fetchMemberDoc(id);
    if (res.ok && res.data) {
      applyMember(res.data);
      setCloudStatus('online');
    } else if (!res.ok) {
      noteCloud(res);
    }
  }, [applyMember, noteCloud]);

  const updateProfile = useCallback<MembershipContextValue['updateProfile']>(
    async patch => {
      const current = memberRef.current;
      if (!current) {
        setError('Önce giriş yap.');
        return { ok: false, reason: 'nosession' };
      }
      const next: MemberDoc = { ...current, ...patch };
      const invalid = validateMembership(next);
      if (invalid) {
        setError(invalid);
        return { ok: false, reason: 'invalid' };
      }
      setBusy(true);
      try {
        const res = await patchMemberDoc(current.id, patch as MemberDoc);
        if (!res.ok) {
          noteCloud(res);
          setError(res.error);
          return { ok: false, reason: res.reason };
        }
        applyMember(res.data);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [applyMember, noteCloud]
  );

  const changePassword = useCallback<MembershipContextValue['changePassword']>(
    async (current0, next0) => {
      const current = memberRef.current;
      if (!current) return { ok: false, reason: 'nosession' };
      if ((next0 || '').length < 6) {
        setError('Yeni parola en az 6 karakter olmalı.');
        return { ok: false, reason: 'short' };
      }
      await auth.ensureAuthConfigLoaded();
      const authMode = auth.isAuthConfigured();
      if (!authMode && !verifyPassword(current0, current.password)) {
        setError('Mevcut parola hatalı.');
        return { ok: false, reason: 'password' };
      }
      setBusy(true);
      try {
        let claimUid = '';
        if (authMode) {
          // Mevcut parolayı Supabase ile doğrula: taze oturum, REQUIRES_RECENT_LOGIN olmaz.
          const check = await auth.signIn(current.email, current0);
          if (!check.ok && check.code === 'EMAIL_NOT_FOUND' && !isCloudAuthBundle(current.password)) {
            // Eski (yerel) hesap: parolayı belgedeki hash ile doğrula, Supabase
            // hesabını YENİ parolayla aç ve belgeyi Supabase’e taşı.
            if (!verifyPassword(current0, current.password)) {
              setError('Mevcut parola hatalı.');
              return { ok: false, reason: 'password' };
            }
            const opened = await auth.signUp(current.email, next0);
            if (!opened.ok) {
              setError(opened.error || 'Supabase hesabı açılamadı.');
              return { ok: false, reason: 'auth' };
            }
            claimUid = opened.session?.uid || '';
          } else if (!check.ok) {
            setError(check.error || 'Mevcut parola hatalı.');
            return { ok: false, reason: 'password' };
          } else {
            const res = await auth.updatePassword(next0);
            if (!res.ok) {
              setError(res.error || 'Parola Supabase Auth’ta güncellenemedi.');
              return { ok: false, reason: 'auth' };
            }
          }
        }
        const sec = authMode ? AUTH_PASSWORD_BUNDLE : hashPassword(next0);
        const res = await patchMemberDoc(
          current.id,
          {
            password: sec,
            ...(claimUid ? { authUid: claimUid } : {}),
          } as Partial<MemberDoc> as MemberDoc
        );
        const merged: MemberDoc = { ...current, password: sec, ...(claimUid ? { authUid: claimUid } : {}) };
        if (!res.ok) {
          // Parola yazması yarım bırakılmaz: belge Supabase’da kalmaya devam eder,
          // cihazda “yarı güncel” bir kopya oluşturulmaz — kullanıcı aynı işlemi
          // tekrarladığında yine tek yerden (buluttan) okur.
          noteCloud(res);
          setError(res.reason === 'denied' ? membershipDeniedMessage(res.error) : res.error);
          return { ok: false, reason: res.reason };
        }
        applyMember(merged);
        setError(null);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [applyMember, noteCloud]
  );

  const deleteAccount = useCallback<MembershipContextValue['deleteAccount']>(
    async password => {
      const current = memberRef.current;
      if (!current) return { ok: false, reason: 'nosession' };
      if (!auth.isAuthConfigured() && !verifyPassword(password, current.password)) {
        setError('Parola hatalı, hesap silinemedi.');
        return { ok: false, reason: 'password' };
      }
      setBusy(true);
      try {
        const res = await deleteMemberDoc(current.id);
        if (!res.ok) {
          setError(res.error);
          return { ok: false, reason: res.reason };
        }
        // Supabase Auth açıksa hesabı oradan da sil (e-posta tekrar kayıtta kullanılabilir).
        if (auth.isAuthConfigured()) await auth.deleteAccount();
        await signOut();
        setMembersVersion(v => v + 1);
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [noteCloud, signOut]
  );

  /* ---------------------------------------------------------------- quota */

  const profileId = member?.id ?? GUEST_PROFILE;

  const usedFor = useCallback<MembershipContextValue['usedFor']>(
    (courseId, topics) => {
      const local = countCourseTests(
        results,
        courseId,
        topics ?? (courseId === 'genel' ? [] : catalog[courseId]) ?? [],
        profileId
      );
      // The membership document mirrors the counters, so clearing local history
      // cannot be used to refill the free allowance.
      const mirrored = memberRef.current?.courseUsage?.[courseId] ?? 0;
      return Math.max(local, mirrored);
    },
    [catalog, results, profileId]
  );

  const remainingFor = useCallback<MembershipContextValue['remainingFor']>(
    (courseId, topics) => remainingTests(quota, usedFor(courseId, topics)),
    [quota, usedFor]
  );

  const canStart = useCallback<MembershipContextValue['canStart']>(
    (courseId, topics) => canStartTest(quota, usedFor(courseId, topics)),
    [quota, usedFor]
  );

  const canStartMixed = useCallback<MembershipContextValue['canStartMixed']>(
    cat => {
      if (!quota.enforced || quota.isVip) return true;
      const ids = Object.keys(cat) as CourseId[];
      const anyCourseLeft = ids.some(id => canStartTest(quota, usedFor(id, cat[id] || [])));
      if (!anyCourseLeft) return false;
      return canStartTest(quota, usedFor('genel', []));
    },
    [quota, usedFor]
  );

  /** Locally observed usage, ready to be pushed into the member document. */
  const localUsageSnapshot = useCallback<MembershipContextValue['localUsageSnapshot']>(() => {
    const ids = Object.keys(catalog) as CourseId[];
    const courseUsage: Record<string, number> = {};
    let testsCompleted = 0;
    let questionsSolved = 0;
    let netSum = 0;
    ids.forEach(id => {
      const used = countCourseTests(results, id, catalog[id] ?? [], profileId);
      if (used > 0) {
        courseUsage[id] = used;
        testsCompleted += used;
      }
    });
    const generalUsed = countCourseTests(results, 'genel', [], profileId);
    if (generalUsed > 0) {
      courseUsage.genel = generalUsed;
      testsCompleted += generalUsed;
    }
    Object.values(results).forEach(r => {
      if ((r.memberId ?? GUEST_PROFILE) !== profileId) return;
      questionsSolved += r.total;
      netSum += r.net;
    });
    return { courseUsage, testsCompleted, questionsSolved, netSum };
  }, [catalog, results, profileId]);

  /** Mirrors counters to the member document (best effort, debounced). */
  const reportTestCompleted = useCallback<MembershipContextValue['reportTestCompleted']>(
    (courseId, r) => {
      const current = memberRef.current;
      if (!current) return;
      const answered = r.correct + r.wrong;
      const next: MemberDoc = {
        ...current,
        testsCompleted: (current.testsCompleted || 0) + 1,
        questionsSolved: (current.questionsSolved || 0) + answered,
        netSum: Math.round(((current.netSum || 0) + answered / 4) * 10) / 10,
        courseUsage: {
          ...(current.courseUsage || {}),
          [courseId]: (current.courseUsage?.[courseId] || 0) + 1,
        },
      };
      applyMember(next);
      // SAYAÇLAR BEKLETİLMEZ: test biter bitmez Supabase'a yazılır (debounce yok).
      // Kasa yalnızca buluttaki belgeyi gösterir; cihazdaki sayaç kaynak değildir.
      const payload = {
        testsCompleted: next.testsCompleted,
        questionsSolved: next.questionsSolved,
        netSum: next.netSum,
        courseUsage: next.courseUsage,
      } as unknown as MemberDoc;
      void patchMemberDoc(next.id, payload).then(res => {
        if (!res.ok) noteCloud(res);
      });
    },
    [applyMember, noteCloud]
  );

  /**
   * Imports the member's cloud-mirrored usage into the local result store so the
   * quota is respected on a fresh device (and so a wipe does not reset the limit).
   */
  const restoreFromCloud = useCallback<MembershipContextValue['restoreFromCloud']>(
    async () => {
      const current = memberRef.current;
      if (!current) return { ok: false, restored: 0, reason: 'nosession' };
      const usage = current.courseUsage || {};
      const entries = Object.entries(usage).filter(([, n]) => n > 0);
      if (entries.length === 0) return { ok: true, restored: 0 };
      const synthetic: Record<string, TestResult> = {};
      for (const [courseId, count] of entries) {
        for (let i = 0; i < count; i++) {
          const key = `cloud_${current.id}_${courseId}_${i}`;
          synthetic[key] = {
            key,
            courseId: courseId as CourseId | 'genel',
            title: 'Buluttan senkronize edilen deneme',
            correct: 0,
            wrong: 0,
            blank: 0,
            total: 0,
            net: 0,
            durationSec: 0,
            completedAt: current.lastLoginAt || new Date().toISOString(),
          };
        }
      }
      updateResultsWithMember(synthetic);
      return { ok: true, restored: entries.length };
    },
    [updateResultsWithMember]
  );

  const syncUsageToCloud = useCallback<MembershipContextValue['syncUsageToCloud']>(
    async usage => {
      const current = memberRef.current;
      if (!current) return { ok: false, reason: 'nosession' };
      const next: MemberDoc = { ...current, ...usage };
      applyMember(next);
      const res = await patchMemberDoc(current.id, {
        testsCompleted: next.testsCompleted,
        questionsSolved: next.questionsSolved,
        courseUsage: next.courseUsage,
      } as unknown as Partial<MemberDoc> as MemberDoc);
      if (!res.ok) {
        noteCloud(res);
        return { ok: false, reason: res.reason };
      }
      return { ok: true };
    },
    [applyMember, noteCloud]
  );

  /* ------------------------------------------------------------ admin API */

  const adminListMembers = useCallback<MembershipContextValue['adminListMembers']>(async () => {
    const res = await listMembers();
    setCloudStatus(res.limited ? (res.error?.includes('kural') ? 'denied' : 'offline') : 'online');
    setCloudMessage(res.limited ? res.error || null : null);
    if (!res.limited) {
      // Mirror into the panel's user list so rows map to real cloud documents.
      admin.syncCloudMembers(
        res.members.map(m => ({
          id: m.id,
          email: m.email,
          displayName: m.displayName,
          role: m.role,
          status: m.status,
          vip: m.vip,
          vipPlan: m.vipPlan,
          vipExpiresAt: m.vipExpiresAt,
          createdAt: m.createdAt,
          lastLoginAt: m.lastLoginAt,
          city: m.city,
          exam: m.exam,
          note: m.note,
          testsCompleted: m.testsCompleted,
          questionsSolved: m.questionsSolved,
          netSum: m.netSum,
        }))
      );
    }
    setMembersVersion(v => v + 1);
    return { members: res.members, limited: res.limited, error: res.error };
  }, [admin]);

  const adminUpsertMember = useCallback<MembershipContextValue['adminUpsertMember']>(
    async m => {
      const invalid = validateMembership(m);
      if (invalid) return { ok: false, error: invalid, reason: 'error' };
      const res = await upsertMemberDoc(m);
      noteCloud(res);
      if (res.ok) setMembersVersion(v => v + 1);
      return res;
    },
    [noteCloud]
  );

  const adminSetVip = useCallback<MembershipContextValue['adminSetVip']>(
    async (memberId, plan) => {
      const vipExpiresAt = expiryForPlan(plan);
      const res = await patchMemberDoc(memberId, {
        vip: plan !== 'free',
        vipPlan: plan,
        vipExpiresAt,
      } as Partial<MemberDoc> as MemberDoc);
      noteCloud(res);
      if (res.ok) {
        if (memberRef.current?.id === memberId) applyMember({ ...memberRef.current, vip: plan !== 'free', vipPlan: plan, vipExpiresAt });
        setMembersVersion(v => v + 1);
        admin.syncCloudMemberPatch(memberId, {
          vip: plan !== 'free',
          vipPlan: plan,
          vipExpiresAt: vipExpiresAt || null,
        });
      }
      return res.ok ? { ok: true, data: true } : res;
    },
    [admin, applyMember, noteCloud]
  );

  const adminSetStatus = useCallback<MembershipContextValue['adminSetStatus']>(
    async (memberId, status) => {
      const res = await patchMemberDoc(memberId, { status } as Partial<MemberDoc> as MemberDoc);
      noteCloud(res);
      if (res.ok) {
        setMembersVersion(v => v + 1);
        // AdminUser has no 'pending' state: approval-pending rows show as suspended.
        admin.syncCloudMemberPatch(memberId, {
          status: status === 'pending' ? 'suspended' : status,
        });
        if (memberRef.current?.id === memberId && (status === 'banned' || status === 'suspended')) {
          await signOut();
        }
      }
      return res.ok ? { ok: true, data: true } : res;
    },
    [admin, noteCloud, signOut]
  );

  const adminSetRole = useCallback<MembershipContextValue['adminSetRole']>(
    async (memberId, role) => {
      const res = await patchMemberDoc(memberId, { role } as Partial<MemberDoc> as MemberDoc);
      noteCloud(res);
      if (res.ok) {
        setMembersVersion(v => v + 1);
        admin.syncCloudMemberPatch(memberId, { role: role === 'user' ? 'user' : 'admin' });
      }
      return res.ok ? { ok: true, data: true } : res;
    },
    [admin, noteCloud]
  );

  const adminDeleteMember = useCallback<MembershipContextValue['adminDeleteMember']>(
    async memberId => {
      const res = await deleteMemberDoc(memberId);
      noteCloud(res);
      if (res.ok) {
        setMembersVersion(v => v + 1);
        admin.dropCloudMember(memberId);
      }
      return res.ok ? { ok: true, data: true } : res;
    },
    [admin, noteCloud]
  );

  const value = useMemo<MembershipContextValue>(
    () => ({
      ready,
      member,
      signedIn: !!member,
      busy,
      error,
      cloudStatus,
      cloudMessage,
      authMode: auth.isAuthConfigured(),
      sendPasswordReset,
      resendConfirmation,
      completePasswordRecovery,
      quota,
      isVip,
      vipSource,
      clearError,
      signUp,
      signIn,
      signOut,
      refreshMember,
      updateProfile,
      changePassword,
      deleteAccount,
      usedFor,
      remainingFor,
      canStart,
      canStartMixed,
      reportTestCompleted,
      restoreFromCloud,
      localUsageSnapshot,
      syncUsageToCloud,
      adminListMembers,
      adminUpsertMember,
      adminSetVip,
      adminSetStatus,
      adminSetRole,
      adminDeleteMember,
      membersVersion,
    }),
    [
      ready,
      member,
      busy,
      error,
      cloudStatus,
      cloudMessage,
      sendPasswordReset,
      resendConfirmation,
      completePasswordRecovery,
      quota,
      isVip,
      vipSource,
      clearError,
      signUp,
      signIn,
      signOut,
      refreshMember,
      updateProfile,
      changePassword,
      deleteAccount,
      usedFor,
      remainingFor,
      canStart,
      canStartMixed,
      reportTestCompleted,
      restoreFromCloud,
      localUsageSnapshot,
      syncUsageToCloud,
      adminListMembers,
      adminUpsertMember,
      adminSetVip,
      adminSetStatus,
      adminSetRole,
      adminDeleteMember,
      membersVersion,
    ]
  );

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
};

export const useMembership = (): MembershipContextValue => {
  const ctx = useContext(MembershipContext);
  if (!ctx) throw new Error('useMembership must be used inside MembershipProvider');
  return ctx;
};

/** Shared entitlement rules so every screen gates the same way. */
export function useEntitlements() {
  const membership = useMembership();
  const admin = useAdmin();
  return {
    isVip: membership.isVip,
    member: membership.member,
    signedIn: membership.signedIn,
    quota: membership.quota,
    /** A gate blocks only when the student is not VIP (VIP state is cloud-driven). */
    locked: (gate: 'karmaExam' | 'tips' | 'review' | 'focus') =>
      !!admin.settings.vipGates[gate] && !membership.isVip,
  };
}
