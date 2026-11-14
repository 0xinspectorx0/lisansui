import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { useMembership } from '../lib/MembershipContext';
import { EXAM_PRESETS } from '../lib/AppContext';
import { AdminButton, AdminCard, AdminField, AdminSectionTitle } from '../components/admin/ui';
import { CloudStatusBanner } from '../components/membership/ui';

type Mode = 'signin' | 'signup';

export const AuthScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const membership = useMembership();
  const admin = useAdmin();
  const { settings, patchSettings } = admin;

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [exam, setExam] = useState(EXAM_PRESETS[0].label);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError || membership.error;
  const busy = membership.busy;

  useEffect(() => {
    setLocalError(null);
    setLocalNotice(null);
    membership.clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const canSignUp = settings.registrationOpen;
  const [resetBusy, setResetBusy] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);

  const doReset = useCallback(async () => {
    setResetBusy(true);
    setLocalError(null);
    setLocalNotice(null);
    const res = await membership.sendPasswordReset(email);
    setResetBusy(false);
    if (res.ok) setLocalNotice(`Şifre sıfırlama bağı ${email.trim()} adresine gönderildi. Spam kutusuna da bak.`);
  }, [email, membership]);

  const submit = useCallback(async () => {
    setLocalError(null);
    const res =
      mode === 'signin'
        ? await membership.signIn(email, password)
        : await membership.signUp({ email, password, displayName: name, city, exam });
    if (res.ok) {
      navigation.goBack();
    }
  }, [city, email, exam, membership, mode, name, navigation, password]);

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
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Üyelik</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Kayıtlar Supabase’da tutulur ve cihazlar arası senkron çalışır
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <CloudStatusBanner />

          <View style={[styles.tabs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['signin', 'signup'] as Mode[]).map(m => (
              <Pressable
                key={m}
                onPress={() => canSignUp || m === 'signin' ? setMode(m) : undefined}
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

          <AdminCard>
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
              placeholder="en az 6 karakter"
              hint={
                mode === 'signup'
                  ? 'Parola asla düz metin yazılmaz: cihazda PBKDF2-SHA256 ile doğrulayıcı + tuz üretilir, Supabase’e böyle kaydedilir.'
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

            {!!localNotice && !error && (
              <View style={[styles.errorBox, { backgroundColor: colors.successSoft, borderColor: colors.border }]}>
                <Ionicons name="mail-outline" size={15} color={colors.success} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.success, lineHeight: 17 }}>
                  {localNotice}
                </Text>
              </View>
            )}

            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerSoft, borderColor: colors.border }]}>
                <Ionicons name="alert-circle" size={15} color={colors.danger} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: colors.danger, lineHeight: 17 }}>
                  {error}
                </Text>
              </View>
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
                label={resetBusy ? 'Gönderiliyor…' : 'Şifremi unuttum'}
                disabled={resetBusy || !email.includes('@')}
                onPress={() => void doReset()}
                style={{ alignSelf: 'flex-start', marginTop: 2 }}
              />
            ) : null}

            <Text style={[styles.quota, { color: colors.textMuted }]}>{quotaHint}</Text>
            {mode === 'signin' && membership.authMode ? (
              <Text style={[styles.quota, { color: colors.textMuted }]}>
                Parolan Supabase Auth’ta saklanır; uygulamada yalnızca e-posta ve hakların tutulur.
              </Text>
            ) : null}
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
              Üyelik doğrulaması doğrudan Supabase belgeleri üzerinden yapılır; Supabase Auth
              hesabına ihtiyaç yoktur. VIP durumu da aynı belgede tutulur, yani yönetici panelinden
              verdiğin VIP anında bu cihazda geçerli olur.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900' },
  sub: { fontSize: 11.5, marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 4, marginBottom: 12, gap: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  tabText: { fontSize: 13, fontWeight: '800' },
  examRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  examChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  examText: { fontSize: 11.5, fontWeight: '800' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  quota: { fontSize: 11.5, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  footNote: { flexDirection: 'row', gap: 6, marginTop: 14, alignItems: 'flex-start' },
  footText: { flex: 1, fontSize: 11.5, lineHeight: 17 },
});
