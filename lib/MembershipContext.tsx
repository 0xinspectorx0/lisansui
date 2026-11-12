/**
 * Membership provider — accounts, VIP entitlements and the free-quota gate.
 *
 * All membership state is stored in Firestore (`memberships/{memberId}`); this
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
import { hashPassword, verifyPassword } from './crypto';
import {
  CloudOutcome,
  createMemberDoc,
  deleteMemberDoc,
  fetchMemberByEmail,
  fetchMemberDoc,
  listMembers,
  patchMemberDoc,
  upsertMemberDoc,
} from './firestoreApi';
import { setTestCompletionListener, useApp } from './AppContext';
import { useAdmin } from './AdminContext';

const SESSION_KEY = '@kpss_session_member_v1';
const MEMBER_CACHE_KEY = '@kpss_member_cache_v1';

export type CloudStatus = 'unknown' | 'online' | 'offline' | 'denied';

interface MembershipContextValue {
  ready: boolean;
  member: MemberDoc | null;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  cloudStatus: CloudStatus;
  cloudMessage: string | null;

  quota: QuotaState;
  /** Effective VIP: cloud member doc (or admin local profile when cloudVip is off). */
  isVip: boolean;
  vipSource: 'cloud' | 'local-admin' | 'none';

  clearError: () => void;
  signUp: (input: { email: string; password: string; displayName: string; city?: string; exam?: string }) => Promise<{ ok: boolean; reason?: string }>;
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
    if (next) AsyncStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(MEMBER_CACHE_KEY).catch(() => {});
  }, []);

  const reportRef = useRef<MembershipContextValue['reportTestCompleted'] | null>(null);
  const adminRef = useRef<ReturnType<typeof useAdmin> | null>(null);
  adminRef.current = admin;

  const noteCloud = useCallback((res: { ok: boolean; error?: string; reason?: string }) => {
    if (res.ok) {
      setCloudStatus('online');
      setCloudMessage(null);
      return;
    }
    setCloudStatus(res.reason === 'denied' ? 'denied' : 'offline');
    setCloudMessage(res.error || 'Firestore işlemi başarısız');
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
        const cached = await AsyncStorage.getItem(MEMBER_CACHE_KEY);
        const id = await sessionStore.get(SESSION_KEY);
        if (cached && !id) {
          // session removed elsewhere -> drop the cache
          await AsyncStorage.removeItem(MEMBER_CACHE_KEY);
        }
        if (id) {
          if (cached) {
            try {
              applyMember(JSON.parse(cached) as MemberDoc);
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
      setBusy(true);
      try {
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
          setError('Firestore’a ulaşılamadı. İnternet bağlantınla üye olman gerekiyor.');
          noteCloud(existing);
          return { ok: false, reason: 'offline' };
        }
        const sec = hashPassword(input.password);
        const now = new Date().toISOString();
        const trial = Math.max(0, membershipCfg.defaultTrialDays);
        const draft: MemberDoc = {
          ...emptyMember(emailKey),
          // Belge id'si normalize e-posta olduğu için alanı da normalize tutuyoruz;
          // firestore.rules `id == email` eşitliğini denetliyor.
          email: emailKey,
          emailNormalized: emailKey,
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
        const created = await createMemberDoc(draft);
        if (!created.ok) {
          noteCloud(created);
          if (created.reason === 'denied') {
            setError(
              'Firestore yazma kuralı izin vermedi. Üyelikler yalnızca Firestore’da tutulduğu için kayıt ancak `firestore.rules` içindeki memberships izni yayınlandığında çalışır.'
            );
          } else {
            setError(created.error);
          }
          return { ok: false, reason: 'write' };
        }
        applyMember(created.data);
        await sessionStore.set(SESSION_KEY, created.data.id);
        setCloudStatus('online');
        setCloudMessage(null);
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
      setBusy(true);
      try {
        const found = await fetchMemberByEmail(emailKey);
        if (!found.ok) {
          noteCloud(found);
          if (found.reason === 'offline') setError('Firestore’a ulaşılamadı, çevrimdışı giriş yapılamaz.');
          else if (found.reason === 'denied')
            setError('Okuma kuralı bu sorguya izin vermiyor (bkz. firestore.rules).');
          else setError(found.error);
          return { ok: false, reason: found.reason };
        }
        const doc = found.data;
        if (!doc) {
          setError('Bu e-posta ile kayıtlı üye bulunamadı.');
          return { ok: false, reason: 'notfound' };
        }
        if (!verifyPassword(password, doc.password)) {
          setError('Parola hatalı.');
          return { ok: false, reason: 'password' };
        }
        if (doc.status === 'banned' || doc.status === 'suspended') {
          setError(
            doc.status === 'banned'
              ? 'Hesabın yasaklandı. Yönetici ile iletişime geç.'
              : 'Hesabın askıya alındı. Yönetici onayı gerekiyor.'
          );
          return { ok: false, reason: doc.status };
        }
        if (doc.status === 'pending') {
          setError('Üyeliğin henüz yönetim onayında.');
          return { ok: false, reason: 'pending' };
        }
        const stamp: Partial<MemberDoc> = { lastLoginAt: new Date().toISOString() };
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
    [applyMember, noteCloud]
  );

  const signOut = useCallback(async () => {
    applyMember(null);
    await sessionStore.remove(SESSION_KEY);
    setError(null);
  }, [applyMember]);

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
      if (!verifyPassword(current0, current.password)) {
        setError('Mevcut parola hatalı.');
        return { ok: false, reason: 'password' };
      }
      setBusy(true);
      try {
        const sec = hashPassword(next0);
        const res = await patchMemberDoc(current.id, { password: sec } as Partial<MemberDoc> as MemberDoc);
        if (!res.ok) {
          noteCloud(res);
          setError(res.error);
          return { ok: false, reason: res.reason };
        }
        applyMember({ ...current, password: sec });
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
      if (!verifyPassword(password, current.password)) {
        setError('Parola hatalı, hesap silinemedi.');
        return { ok: false, reason: 'password' };
      }
      setBusy(true);
      try {
        const res = await deleteMemberDoc(current.id);
        if (!res.ok) {
          noteCloud(res);
          setError(res.error);
          return { ok: false, reason: res.reason };
        }
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
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const payload = {
          testsCompleted: next.testsCompleted,
          questionsSolved: next.questionsSolved,
          netSum: next.netSum,
          courseUsage: next.courseUsage,
        } as unknown as MemberDoc;
        patchMemberDoc(next.id, payload).then(res => {
          if (!res.ok) {
            // Non-fatal: local counters already include this test, the mirror is
            // best-effort. Surface it in the cloud banner instead.
            noteCloud(res);
          }
        });
      }, 900);
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
