import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { consumeAuthRedirect } from '../lib/authClient';
import { EXAM_PRESETS } from '../lib/AppContext';
import { AdminButton, AdminCard, AdminField, AdminSectionTitle } from '../components/admin/ui';
import { CloudStatusBanner } from '../components/membership/ui';

type Mode = 'signin' | 'signup' | 'forgot' | 'recovery';

export const AuthScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const membership = useMembership();
  const admin = useAdmin();
  const { settings, patchSettings } = admin;

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [exam, setExam] = useState(EXAM_PRESETS[0].label);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const error = localError || membership.error;
  const busy = membership.busy || resetBusy;
  const canSignUp = settings.registrationOpen;

  const goHomeOrBack = useCallback(() => {
    if (navigation.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  const switchMode = useCallback(
    (nextMode: Mode, notice: string | null = null) => {
      setLocalError(null);
      setLocalNotice(notice);
      membership.clearError();
      setMode(nextMode);
    },
    [membership]
  );

  // E-postadaki onay veya şifre sıfırlama bağlantısından gelindiyse yakala
  useEffect(() => {
    let active = true;
    void (async () => {
      const redirected = await consumeAuthRedirect();
      if (!active || !redirected) return;
      if (redirected.email) setEmail(redirected.email);
      if (redirected.kind === 'signup') {
        setMode('signin');
        setLocalError(null);
        membership.clearError();
        setLocalNotice('Üyeliğiniz onaylandı! Şimdi e-posta adresiniz ve parolanızla giriş yapabilirsiniz.');
      } else if (redirected.kind === 'recovery') {
        setMode('recovery');
        setLocalError(null);
        membership.clearError();
        setLocalNotice('Şifre sıfırlama bağlantısı doğrulandı. Lütfen yeni parolanızı belirleyin.');
      } else if (redirected.kind === 'error') {
        setMode('signin');
        setLocalNotice(null);
        setLocalError(redirected.error || 'E-posta bağlantısının süresi dolmuş veya geçersiz.');
      }
    })();
    return () => {
      active = false;
    };
  }, [membership]);

  const doResetRequest = useCallback(async () => {
    setResetBusy(true);
    setLocalError(null);
    setLocalNotice(null);
    membership.clearError();
    const res = await membership.sendPasswordReset(email);
    setResetBusy(false);
    if (res.ok) {
      setLocalNotice(
        `Şifre sıfırlama bağlantısı ${email.trim()} adresine gönderildi! Lütfen mail kutunuzu (ve spam klasörünü) kontrol edin; gelen bağlantıya tıkladığınızda yeni şifre belirleme ekranı açılacaktır.`
      );
    }
  }, [email, membership]);

  const doCompleteRecovery = useCallback(async () => {
    setLocalError(null);
    setLocalNotice(null);
    membership.clearError();
    if ((newPassword || '').length < 6) {
      setLocalError('Yeni parola en az 6 karakter olmalı.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Girdiğiniz yeni parolalar birbiriyle eşleşmiyor.');
      return;
    }
    const res = await membership.completePasswordRecovery(newPassword);
    if (res.ok) {
      if (res.email) setEmail(res.email);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      switchMode(
        'signin',
        'Yeni şifreniz başarıyla kaydedildi! Şimdi yeni şifrenizle giriş yapabilirsiniz.'
      );
    }
  }, [confirmPassword, membership, newPassword, switchMode]);

  const submit = useCallback(async () => {
    if (mode === 'forgot') {
      await doResetRequest();
      return;
    }
    if (mode === 'recovery') {
      await doCompleteRecovery();
      return;
    }
    setLocalError(null);
    setLocalNotice(null);
    if (mode === 'signin') {
      const res = await membership.signIn(email, password);
      if (res.ok) {
        goHomeOrBack();
      }
      return;
    }
    const res = await membership.signUp({ email, password, displayName: name, city, exam });
    if (res.ok) {
      setPassword('');
      switchMode(
        'signin',
        'Kaydınız alındı! Lütfen e-posta kutunuzu (ve spam klasörünü) kontrol edin. Gelen onay mailindeki bağlantıya tıkladıktan sonra giriş yapabilirsiniz.'
      );
    }
  }, [city, doCompleteRecovery, doResetRequest, email, exam, goHomeOrBack, membership, mode, name, password, switchMode]);

  const quotaHint = useMemo(
    () =>
      settings.membership.enforce
        ? `Üye olmayanlar ve ücretsiz üyeler her dersten ${settings.membership.freeTestsPerCourse} test çözebilir.`
        : 'Şu an hak sınırı kapalı — yönetici panelinden açılabilir.',
    [settings.membership]
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable
            onPress={goHomeOrBack}
            hitSlop={10}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {mode === 'recovery'
                ? 'Yeni Şifre Belirle'
                : mode === 'forgot'
                ? 'Şifremi Unuttum'
                : 'Üyelik'}
            </Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {mode === 'recovery'
                ? 'Hesabınız için yeni parolanızı girin'
                : mode === 'forgot'
                ? 'E-posta adresinize şifre sıfırlama bağlantısı gönderilir'
                : 'Kayıtlar Supabase’da tutulur ve cihazlar arası senkron çalışır'}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <CloudStatusBanner />

          {(mode === 'signin' || mode === 'signup') && (
            <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {(['signin', 'signup'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => (canSignUp || m === 'signin' ? switchMode(m) : undefined)}
                  style={[
                    styles.tab,
                    mode === m && { backgroundColor: colors.primary },
                    !canSignUp && m === 'signup' && { opacity: 0.4 },
                  ]}
                >
                  <Text style={[styles.tabText, { color: mode === m ? '#FFFFFF' : colors.textSecondary }]}>
                    {m === 'signin' ? 'Giriş yap' : 'Üye ol'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <AdminCard>
            {!!localNotice && !error && (
              <View style={[styles.noticeBox, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.success, lineHeight: 18 }}>
                  {localNotice}
                </Text>
              </View>
            )}

            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft, borderColor: colors.border }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.danger, lineHeight: 17 }}>
                  {error}
                </Text>
              </View>
            )}

            {mode === 'recovery' ? (
              <>
                {!!email && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 }}>
                    Hesap: {email}
                  </Text>
                )}
                <AdminField
                  label="Yeni parola"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                  secureTextEntry
                  placeholder="En az 6 karakter"
                />
                <AdminField
                  label="Yeni parola (tekrar)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  secureTextEntry
                  placeholder="Yeni parolanızı tekrar yazın"
                />
                <AdminButton
                  label={busy ? 'Kaydediliyor…' : 'Yeni şifremi kaydet'}
                  icon="key-outline"
                  onPress={submit}
                  disabled={busy}
                  style={{ alignSelf: 'stretch', marginTop: 4 }}
                />
                <AdminButton
                  small
                  tone="ghost"
                  icon="arrow-back-outline"
                  label="Giriş ekranına dön"
                  disabled={busy}
                  onPress={() => switchMode('signin')}
                  style={{ alignSelf: 'flex-start', marginTop: 6 }}
                />
              </>
            ) : mode === 'forgot' ? (
              <>
                <AdminField
                  label="Kayıtlı e-posta adresiniz"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="ornek@eposta.com"
                  hint="Bu adrese yeni şifre belirleme bağlantısı içeren bir e-posta gönderilecektir."
                />
                <AdminButton
                  label={busy ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
                  icon="mail-outline"
                  onPress={submit}
                  disabled={busy}
                  style={{ alignSelf: 'stretch', marginTop: 4 }}
                />
                <AdminButton
                  small
                  tone="ghost"
                  icon="arrow-back-outline"
                  label="Giriş ekranına dön"
                  disabled={busy}
                  onPress={() => switchMode('signin')}
                  style={{ alignSelf: 'flex-start', marginTop: 6 }}
                />
              </>
            ) : (
              <>
                <AdminField
                  label="E-posta"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="ornek@eposta.com"
                />
                {mode === 'signup' && (
                  <AdminField label="Ad soyad" value={name} onChangeText={setName} placeholder="Örn: Selin Aydoğan" />
                )}
                <AdminField
                  label="Parola"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  secureTextEntry
                  placeholder="en az 6 karakter"
                  hint={
                    mode === 'signup'
                      ? 'Kayıt olduktan sonra e-posta adresinize bir onay bağlantısı gönderilir.'
                      : undefined
                  }
                />
                {mode === 'signup' && (
                  <>
                    <AdminField label="Şehir (opsiyonel)" value={city} onChangeText={setCity} placeholder="Örn: Elazığ" />
                    <AdminSectionTitle label="Hazırlandığın sınav" />
                    <View style={styles.examRow}>
                      {EXAM_PRESETS.map(p => (
                        <Pressable
                          key={p.id}
                          onPress={() => setExam(p.label)}
                          style={[
                            styles.examChip,
                            {
                              backgroundColor: exam === p.label ? colors.primarySoft : colors.surfaceSecondary,
                              borderColor: exam === p.label ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.examText, { color: exam === p.label ? colors.primary : colors.textSecondary }]}>
                            {p.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}

                <AdminButton
                  label={busy ? 'İşleniyor…' : mode === 'signin' ? 'Giriş yap' : 'Hesabımı oluştur'}
                  icon={mode === 'signin' ? 'log-in-outline' : 'person-add-outline'}
                  onPress={submit}
                  disabled={busy}
                  style={{ alignSelf: 'stretch', marginTop: 4 }}
                />

                {mode === 'signin' && membership.authMode ? (
                  <AdminButton
                    small
                    tone="ghost"
                    icon="help-circle-outline"
                    label="Şifremi unuttum"
                    disabled={busy}
                    onPress={() => switchMode('forgot')}
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  />
                ) : null}

                <Text style={[styles.quota, { color: colors.textMuted }]}>{quotaHint}</Text>
                {mode === 'signin' && membership.authMode ? (
                  <Text style={[styles.quota, { color: colors.textMuted }]}>
                    Parolan Supabase Auth’ta saklanır; uygulamada yalnızca e-posta ve hakların tutulur.
                  </Text>
                ) : null}
              </>
            )}
          </AdminCard>

          {mode === 'signup' && !canSignUp && (
            <AdminCard style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ fontSize: 12.5, color: colors.textSecondary, lineHeight: 18 }}>
                Yeni kayıtlar yönetim tarafından kapatılmış görünüyor. Yönetici olarak giriş yaptıysan
                paneldeki “Yeni hesap açılışı” anahtarını açabilirsin.
              </Text>
              <AdminButton
                small
                tone={settings.registrationOpen ? 'neutral' : 'success'}
                icon={settings.registrationOpen ? 'lock-closed-outline' : 'lock-open-outline'}
                label={settings.registrationOpen ? 'Kayıtları kapat' : 'Kayıtları aç'}
                onPress={() => patchSettings({ registrationOpen: !settings.registrationOpen })}
                style={{ alignSelf: 'flex-start' }}
              />
            </AdminCard>
          )}

          <View style={styles.footNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.footText, { color: colors.textMuted }]}>
              Kayıt olduktan sonra gelen onay mailindeki bağlantıya tıklayarak hesabınızı aktif
              edebilirsiniz. VIP durumu da Supabase’de tutulur, yönetici panelinden verilen VIP
              anında geçerli olur.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900' },
  sub: { fontSize: 11.5, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  tabs: { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 4, marginBottom: 12, gap: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  tabText: { fontSize: 13, fontWeight: '800' },
  examRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  examChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  examText: { fontSize: 11.5, fontWeight: '800' },
  noticeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  quota: { fontSize: 11.5, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  footNote: { flexDirection: 'row', gap: 6, marginTop: 14, alignItems: 'flex-start' },
  footText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
});
