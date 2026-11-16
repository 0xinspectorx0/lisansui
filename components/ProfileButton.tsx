import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAppTheme } from '../lib/theme';

/** One accessible profile control; VIP decoration does not intercept presses. */
export const ProfileButton: React.FC<{
  signedIn: boolean;
  isVip: boolean;
  onPress: () => void;
}> = ({ signedIn, isVip, onPress }) => {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={signedIn ? (isVip ? 'Hesabım, VIP üye' : 'Hesabım') : 'Giriş yap'}
      onPress={onPress}
      hitSlop={8}
      style={[styles.control, isVip && styles.vipControl]}
    >
      <View style={[styles.avatar, {
        backgroundColor: signedIn ? colors.successSoft : colors.surface,
        borderColor: isVip ? colors.warning : colors.border,
      }]}>
        <Ionicons
          name={signedIn ? 'person' : 'person-add-outline'}
          size={19}
          color={signedIn ? colors.success : colors.text}
        />
        {isVip && (
          <View pointerEvents="none" style={styles.crown}>
            <MaterialCommunityIcons name="crown" size={19} color={colors.warning} />
          </View>
        )}
      </View>
      {isVip && <Text style={[styles.vipLabel, { color: colors.warning }]}>VIP</Text>}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  control: { alignItems: 'center', justifyContent: 'center' },
  vipControl: { paddingTop: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -10, alignSelf: 'center' },
  vipLabel: { fontSize: 10, lineHeight: 12, fontWeight: '900', marginTop: 1 },
});
