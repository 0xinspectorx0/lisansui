import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../../lib/theme';
import { useAdmin } from '../../lib/AdminContext';
import { AdminButton } from './ui';

/**
 * Blocks the student-facing app while the admin has maintenance mode on.
 * An unlocked admin session always passes through, so the panel stays reachable.
 */
export const AdminMaintenanceGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { maintenanceActive, unlocked, settings } = useAdmin();

  if (!maintenanceActive || unlocked) return <>{children}</>;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.warningSoft }]}>
          <Ionicons name="construct" size={30} color={colors.warning} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {settings.maintenance.title || 'Bakım modu'}
        </Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {settings.maintenance.message}
        </Text>
        <View style={styles.actions}>
          <AdminButton
            label="Yönetici girişi"
            icon="shield-checkmark-outline"
            onPress={() => navigation.navigate('AdminLogin')}
            flex
          />
        </View>
        <Text style={[styles.kicker, { color: colors.textMuted }]}>
          Çalışmaların (deneme, favori, hata defteri) güvende — bakım bitince devam edersin.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  message: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 330 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14, width: '100%', maxWidth: 320 },
  kicker: { fontSize: 11.5, textAlign: 'center', marginTop: 10, lineHeight: 16, maxWidth: 300 },
});
