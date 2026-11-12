import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '../../lib/theme';
import { useAdmin } from '../../lib/AdminContext';
import { DEFAULT_ADMIN_PIN } from '../../lib/adminStore';
import { AdminButton, AdminCard } from './ui';

/**
 * Renders admin screen content only while the session is unlocked; otherwise it
 * shows an inline PIN pad (so no admin screen can be seen without the code).
 */
export const AdminGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useAppTheme();
  const { unlocked, unlock, pinIsDefault } = useAdmin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (unlocked) return <>{children}</>;

  return (
    <AdminCard pad={18} style={{ marginTop: 8 }}>
      <View style={styles.head}>
        <View style={[styles.shield, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="lock-closed" size={18} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Yönetici girişi gerekli</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Bu bölüm PIN kodu ile korunuyor. Giriş 15 dakika boyunca geçerli kalır.
        </Text>
      </View>

      <TextInput
        value={pin}
        onChangeText={t => {
          setError(null);
          setPin(t.replace(/\D/g, '').slice(0, 8));
        }}
        onSubmitEditing={() => {
          if (!unlock(pin)) setError('PIN hatalı.');
          else setPin('');
        }}
        placeholder="PIN kodu"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        secureTextEntry
        autoCorrect={false}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: error ? colors.danger : colors.border,
            color: colors.text,
          },
        ]}
      />

      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      {pinIsDefault && !error && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Varsayılan PIN: {DEFAULT_ADMIN_PIN}
        </Text>
      )}

      <View style={styles.actions}>
        <AdminButton
          label="Giriş yap"
          icon="log-in-outline"
          onPress={() => {
            if (!unlock(pin)) setError('PIN hatalı.');
            else setPin('');
          }}
          flex
        />
      </View>
    </AdminCard>
  );
};

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 6, marginBottom: 14 },
  shield: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15.5, fontWeight: '900', marginTop: 4 },
  sub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
  },
  error: { fontSize: 12.5, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  hint: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
});
