import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAppTheme } from '../lib/theme';

/** Tab icon only; the navigator owns the accessible press target and label. */
export const ProfileIcon: React.FC<{
  signedIn: boolean;
  isVip: boolean;
  color: string;
}> = ({ signedIn, isVip, color }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.avatar, { borderColor: isVip ? colors.warning : color }]}>
      <Ionicons name={signedIn ? 'person' : 'person-add-outline'} size={17} color={color} />
      {isVip && (
        <View pointerEvents="none" style={styles.crown}>
          <MaterialCommunityIcons name="crown" size={10} color={colors.warning} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -4, alignSelf: 'center' },
});
