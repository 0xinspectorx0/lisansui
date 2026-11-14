import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../lib/theme';
import { useAdmin } from '../lib/AdminContext';
import { DEFAULT_ADMIN_PIN } from '../lib/adminStore';
import { AdminButton } from '../components/admin/ui';

export const AdminLoginScreen: React.FC = () => {
  const { colors } = useAppTheme();
  const { unlock, unlocked, pinIsDefault, lock } = useAdmin();
  const navigation = useNavigation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const digits = useMemo(() => pin.split('').map(Number), [pin]);

  const press = (d: number) => {
    setError(null);
    setPin(prev => (prev.length >= 8 ? prev : `${prev}${d}`));
  };

  const submit = (value: string) => {
    if (!value) {
      setError('PIN kodunu gir.');
      return;
    }
    if (unlock(value)) {
      setPin('');
      navigation.navigate('AdminPanel' as never);
    } else {
      setError('PIN hatalı. Tekrar dene.');
      setPin('');
    }
  };

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <View
            style={[
              styles.shield,
              { backgroundColor: colors.isDark ? 'rgba(167,139,250,0.16)' : 'rgba(124,58,237,0.10)' },
            ]}
          >
            <Ionicons
              name="shield-checkmark"
              size={30}
              color={colors.isDark ? '#A78BFA' : '#7C3AED'}
            />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Yönetici Paneli</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Soru havuzu, konular, kullanıcılar ve VIP kayıtları. Devam etmek için PIN kodunu
            gir.
          </Text>

          {unlocked && (
            <View
              style={[
                styles.alreadyCard,
                { backgroundColor: colors.successSoft, borderColor: colors.border },
              ]}
            >
              <Ionicons name="checkmark-circle" size={17} color={colors.success} />
              <Text style={[styles.alreadyText, { color: colors.success }]}>
                Bu oturumda giriş yapılmış. Panele dönebilirsin.
              </Text>
            </View>
          )}

          <View style={[styles.pinRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {Array.from({ length: Math.max(4, digits.length) }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pinBox,
                  {
                    borderColor: error ? colors.danger : colors.border,
                    backgroundColor: i < digits.length ? colors.primary : 'transparent',
                  },
                ]}
              >
                {i < digits.length && (
                  <Text style={styles.pinDigit}>{digits[i]}</Text>
                )}
              </View>
            ))}
          </View>

          {!!error && (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          )}
          {pinIsDefault && !error && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Varsayılan PIN: {DEFAULT_ADMIN_PIN} — Ayarlar’dan değiştir.
            </Text>
          )}

          <View style={styles.pad}>
            {keys.map(k => (
              <Pressable
                key={k}
                onPress={() => press(k)}
                style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Text style={[styles.keyText, { color: colors.text }]}>{k}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                setPin('');
                setError(null);
              }}
              style={[styles.key, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={[styles.keyText, { color: colors.textSecondary, fontSize: 13, fontWeight: '800' }]}>
                Temizle
              </Text>
            </Pressable>
            <Pressable
              onPress={() => press(0)}
              style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.keyText, { color: colors.text }]}>0</Text>
            </Pressable>
            <Pressable
              onPress={() => setPin(prev => prev.slice(0, -1))}
              style={[styles.key, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Ionicons name="backspace-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.actions}>
            <AdminButton label="Giriş yap" icon="log-in-outline" onPress={() => submit(pin)} flex />
            {unlocked ? (
              <AdminButton label="Kilitle" tone="neutral" icon="lock-closed-outline" onPress={lock} flex />
            ) : (
              <AdminButton label="Panele geç" tone="ghost" icon="grid-outline" onPress={() => navigation.navigate('AdminPanel' as never)} flex />
            )}
          </View>

          <Pressable
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs' as never))}
            hitSlop={10}
            style={styles.backRow}
          >
            <Ionicons name="chevron-back" size={14} color={colors.textMuted} />
            <Text style={[styles.backText, { color: colors.textMuted }]}>Uygulamaya dön</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 10 },
  shield: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 320 },
  alreadyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  alreadyText: { fontSize: 12, fontWeight: '700' },
  pinRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  pinBox: {
    width: 40,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDigit: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  error: { fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  hint: { fontSize: 12, marginTop: 6 },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    maxWidth: 260,
    width: '100%',
  },
  key: {
    width: '30%',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 17, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, width: '100%', maxWidth: 320 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 14 },
  backText: { fontSize: 12.5, fontWeight: '700' },
});
