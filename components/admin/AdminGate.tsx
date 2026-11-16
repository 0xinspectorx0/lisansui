import React from 'react';
import { Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../../lib/theme';
import { useAdminAccess } from '../../lib/AdminAccessContext';
import { useMembership } from '../../lib/MembershipContext';
import { AdminButton, AdminCard } from './ui';

/** Gates admin routes on a verified server-side admin identity, never a local PIN. */
export const AdminGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useAppTheme();
  const navigation = useNavigation<any>();
  const { status, refresh } = useAdminAccess();
  const { signedIn } = useMembership();
  if (status === 'allowed') return <>{children}</>;
  return (
    <AdminCard pad={18} style={{ marginTop: 8, gap: 12 }}>
      <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text }}>
        {status === 'checking' ? 'Yönetici yetkisi kontrol ediliyor…' : status === 'error' ? 'Yönetici yetkisi doğrulanamadı' : 'Bu bölüm için yönetici yetkisi gerekli'}
      </Text>
      <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
        {status === 'error'
          ? 'Supabase bağlantısını kontrol edip tekrar deneyin. Yetki doğrulanmadan panel açılmaz.'
          : signedIn
            ? 'Bu hesap için Supabase yönetici yetkisi bulunamadı.'
            : 'Yönetici yetkisine sahip hesabınızla normal üyelik ekranından giriş yapın.'}
      </Text>
      {status === 'error' ? <AdminButton label="Tekrar dene" onPress={refresh} /> : !signedIn && status !== 'checking' ? <AdminButton label="Üye girişi" onPress={() => navigation.navigate('Auth', { mode: 'giris' })} /> : null}
      <AdminButton label="Geri" tone="neutral" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs')} />
    </AdminCard>
  );
};
