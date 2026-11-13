import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useAppTheme } from '../../lib/theme';

/** Accent used across the admin area (violet) — keeps it visually distinct. */
export function useAdminAccent() {
  const { colors } = useAppTheme();
  return {
    accent: colors.isDark ? '#A78BFA' : '#7C3AED',
    accentSoft: colors.isDark ? 'rgba(167,139,250,0.16)' : 'rgba(124,58,237,0.10)',
    colors,
  };
}

/* ------------------------------------------------------------------ shell */

export const AdminScaffold: React.FC<{
  title: string;
  subtitle?: string;
  icon?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: object;
  hideBack?: boolean;
}> = ({ title, subtitle, icon, right, children, scroll = true, contentStyle, hideBack }) => {
  const { colors } = useAdminAccent();
  const navigation = useNavigation();
  const Body = (
    <View style={[{ padding: 16, paddingBottom: 34 }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        {!hideBack && (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <Ionicons name="chevron-back" size={19} color={colors.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!icon && <Ionicons name={icon as any} size={15} color={colors.primary} />}
            <Text
              numberOfLines={1}
              style={{ fontSize: 16.5, fontWeight: '800', color: colors.text }}
            >
              {title}
            </Text>
          </View>
          {!!subtitle && (
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>

      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {Body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </SafeAreaView>
  );
};

export const AdminSectionTitle: React.FC<{
  label: string;
  hint?: string;
  action?: React.ReactNode;
}> = ({ label, hint, action }) => {
  const { colors } = useAdminAccent();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8, marginTop: 4 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.text, letterSpacing: 0.2 }}>
          {label}
        </Text>
        {!!hint && (
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
            {hint}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
};

export const AdminCard: React.FC<{
  children: React.ReactNode;
  style?: object;
  pad?: number;
}> = ({ children, style, pad = 14 }) => {
  const { colors } = useAdminAccent();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </View>
  );
};

/* ---------------------------------------------------------------- buttons */

type ButtonTone = 'primary' | 'ghost' | 'danger' | 'neutral' | 'success';

export const AdminButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: string;
  tone?: ButtonTone;
  disabled?: boolean;
  small?: boolean;
  style?: object;
  flex?: boolean;
}> = ({ label, onPress, icon, tone = 'primary', disabled, small, style, flex }) => {
  const { accent, accentSoft, colors } = useAdminAccent();
  const bg =
    tone === 'primary'
      ? accent
      : tone === 'danger'
      ? colors.danger
      : tone === 'success'
      ? colors.success
      : tone === 'ghost'
      ? accentSoft
      : colors.surfaceSecondary;
  const fg =
    tone === 'primary' || tone === 'danger' || tone === 'success'
      ? '#FFFFFF'
      : tone === 'ghost'
      ? accent
      : colors.text;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: small ? 8 : 12,
        paddingHorizontal: small ? 10 : 14,
        borderRadius: 12,
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.86 : 1,
        borderWidth: tone === 'neutral' ? 1 : 0,
        borderColor: colors.border,
        // flex verilmediyse buton İÇERİĞİNE göre boyutlanır.
        // Tuzak: eskiden burada sabit `flexBasis: 0` + `flexGrow: 0` vardı; RN'de
        // flexShrink'in varsayılanı 0 olduğu için kutu 0 px kalıyor, ikon+yazı
        // kutunun dışına taşıp YANDAKİ butonların üstüne biniyordu (ve yazı
        // "So / ek" diye bir-iki harfe kıvrılıyordu).
        flexGrow: flex ? 1 : 0,
        flexShrink: flex ? 1 : 0,
        flexBasis: flex ? 0 : 'auto',
        ...(style || {}),
      })}
    >
      {!!icon && <Ionicons name={icon as any} size={small ? 14 : 17} color={fg} />}
      <Text
        style={{
          fontSize: small ? 12.5 : 14,
          fontWeight: '800',
          color: fg,
          // flex=true olduğunda payı komşularla bölüşür: yazı kutudan taşmak
          // yerine sarar (textAlign merkezde kalır).
          textAlign: 'center',
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

export const AdminIconButton: React.FC<{
  icon: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  size?: number;
}> = ({ icon, onPress, color, disabled, size = 17 }) => {
  const { colors } = useAdminAccent();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
        opacity: disabled ? 0.3 : 1,
      })}
    >
      <Ionicons name={icon as any} size={size} color={color || colors.textSecondary} />
    </Pressable>
  );
};

/* ------------------------------------------------------------------ chips */

export const AdminChip: React.FC<{
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  icon?: string;
  onPress?: () => void;
  active?: boolean;
  compact?: boolean;
}> = ({ label, tone = 'default', icon, onPress, active, compact }) => {
  const { accent, accentSoft, colors } = useAdminAccent();
  const map: Record<string, { bg: string; fg: string }> = {
    default: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: accentSoft, fg: accent },
  };
  const style = active ? { bg: accent, fg: '#FFFFFF' } : map[tone];
  const Comp = onPress ? Pressable : View;
  return (
    <Comp
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 6,
        borderRadius: 999,
        backgroundColor: style.bg,
        borderWidth: active ? 0 : 1,
        borderColor: 'transparent',
      }}
    >
      {!!icon && <Ionicons name={icon as any} size={12} color={style.fg} />}
      <Text style={{ fontSize: compact ? 11 : 12, fontWeight: '800', color: style.fg }}>
        {label}
      </Text>
    </Comp>
  );
};

/* ------------------------------------------------------------------ rows */

export const AdminRow: React.FC<{
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  badge?: string;
  danger?: boolean;
  compact?: boolean;
  style?: object;
}> = ({ icon, iconColor, title, subtitle, right, onPress, badge, danger, compact, style }) => {
  const { accent, colors } = useAdminAccent();
  const Body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: compact ? 8 : 12,
        paddingHorizontal: 2,
      }}
    >
      {!!icon && (
        <View
          style={{
            width: compact ? 28 : 34,
            height: compact ? 28 : 34,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: danger ? colors.dangerSoft : colors.surfaceSecondary,
          }}
        >
          <Ionicons
            name={icon as any}
            size={compact ? 14 : 17}
            color={danger ? colors.danger : iconColor || accent}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            numberOfLines={2}
            style={{ fontSize: 13.5, fontWeight: '700', color: danger ? colors.danger : colors.text, flexShrink: 1 }}
          >
            {title}
          </Text>
          {!!badge && (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: accent,
              }}
            >
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' }}>{badge}</Text>
            </View>
          )}
        </View>
        {!!subtitle && (
          <Text numberOfLines={2} style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );

  if (!onPress) {
    return (
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, ...style }}>
        {Body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.surfaceSecondary : 'transparent',
        ...(style || {}),
      })}
    >
      {Body}
    </Pressable>
  );
};

export const AdminOrderControls: React.FC<{
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  extra?: React.ReactNode;
}> = ({ index, total, onMove, extra }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    {extra}
    <AdminIconButton icon="chevron-up" onPress={() => onMove(-1)} disabled={index <= 0} size={16} />
    <AdminIconButton
      icon="chevron-down"
      onPress={() => onMove(1)}
      disabled={index >= total - 1}
      size={16}
    />
  </View>
);

/* -------------------------------------------------------------- controls */

export const AdminField: React.FC<{
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  hint?: string;
}> = ({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  autoCapitalize = 'sentences',
  maxLength,
  hint,
}) => {
  const { accent, colors } = useAdminAccent();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && (
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.textSecondary, marginBottom: 5 }}>
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          minHeight: multiline ? 96 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
          paddingTop: multiline ? 12 : 0,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: focused ? accent : colors.border,
          backgroundColor: colors.surfaceSecondary,
          color: colors.text,
          fontSize: 13.5,
          fontWeight: '600',
        }}
      />
      {!!hint && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{hint}</Text>}
    </View>
  );
};

export const AdminToggle: React.FC<{
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon?: string;
}> = ({ label, description, value, onValueChange, icon }) => {
  const { accent, colors } = useAdminAccent();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {!!icon && (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: value ? colors.successSoft : colors.surfaceSecondary,
          }}
        >
          <Ionicons name={icon as any} size={16} color={value ? colors.success : colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{label}</Text>
        {!!description && (
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 15 }}>
            {description}
          </Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: accent, false: colors.borderStrong }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
};

export const AdminStepper: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
  description?: string;
}> = ({ label, value, min = 0, max = 999, step = 1, onChange, suffix, description }) => {
  const { accent, colors } = useAdminAccent();
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{label}</Text>
        {!!description && (
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{description}</Text>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          backgroundColor: colors.surfaceSecondary,
          borderRadius: 11,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 4,
          paddingVertical: 2,
        }}
      >
        <AdminIconButton icon="remove-circle-outline" onPress={dec} disabled={value <= min} size={18} />
        <Text style={{ minWidth: 44, textAlign: 'center', fontSize: 13, fontWeight: '800', color: accent }}>
          {value}
          {suffix ? ` ${suffix}` : ''}
        </Text>
        <AdminIconButton icon="add-circle-outline" onPress={inc} disabled={value >= max} size={18} />
      </View>
    </View>
  );
};

export const AdminSegmented: React.FC<{
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}> = ({ options, value, onChange, label }) => {
  const { accent, colors } = useAdminAccent();
  return (
    <View style={{ marginBottom: 10 }}>
      {!!label && (
        <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.textSecondary, marginBottom: 5 }}>
          {label}
        </Text>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          backgroundColor: colors.surfaceSecondary,
          borderRadius: 12,
          padding: 4,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {options.map(o => {
          const active = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              style={{
                flexShrink: 1,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 9,
                backgroundColor: active ? accent : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  color: active ? '#FFFFFF' : colors.textSecondary,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const AdminSearchBar: React.FC<{
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}> = ({ value, onChangeText, placeholder = 'Ara…' }) => {
  const { accent, colors } = useAdminAccent();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        height: 42,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        marginBottom: 12,
      }}
    >
      <Ionicons name="search" size={16} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={accent} />
        </Pressable>
      )}
    </View>
  );
};

/* ----------------------------------------------------------------- modal */

export const AdminSheet: React.FC<{
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ visible, title, onClose, children, footer }) => {
  const { colors } = useAdminAccent();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.55)' }} onPress={onClose}>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
      </Pressable>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          paddingBottom: Platform.OS === 'web' ? 18 : 28,
        }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}
          style={{ maxHeight: 480 }}
        >
          {children}
        </ScrollView>
        {!!footer && (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
            {footer}
          </View>
        )}
      </View>
    </Modal>
  );
};

export const AdminConfirm: React.FC<{
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ visible, title, message, confirmLabel = 'Sil', onConfirm, onCancel }) => {
  const { colors } = useAdminAccent();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(2,6,23,0.55)' }}>
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 18,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ionicons name="alert-circle" size={19} color={colors.danger} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>{title}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }}>{message}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <AdminButton label="Vazgeç" tone="neutral" onPress={onCancel} flex />
            <AdminButton label={confirmLabel} tone="danger" onPress={onConfirm} flex />
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const AdminEmpty: React.FC<{ icon: string; title: string; hint?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  hint,
  action,
}) => {
  const { colors } = useAdminAccent();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        <Ionicons name={icon as any} size={24} color={colors.textMuted} />
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.text }}>{title}</Text>
      {!!hint && (
        <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 17 }}>
          {hint}
        </Text>
      )}
      {action}
    </View>
  );
};

export const AdminSpinner: React.FC<{ label?: string }> = ({ label }) => {
  const { colors } = useAdminAccent();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 }}>
      <ActivityIndicator size="small" color={colors.primary} />
      {!!label && <Text style={{ fontSize: 12.5, color: colors.textMuted }}>{label}</Text>}
    </View>
  );
};

export const AdminStat: React.FC<{
  label: string;
  value: string;
  icon: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}> = ({ label, value, icon, tone = 'default' }) => {
  const { accent, accentSoft, colors } = useAdminAccent();
  const map: Record<string, { bg: string; fg: string }> = {
    default: { bg: colors.surfaceSecondary, fg: colors.textSecondary },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: accentSoft, fg: accent },
  };
  const t = map[tone];
  return (
    <View style={{ flexBasis: '46%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.bg,
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon as any} size={15} color={t.fg} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '900', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 1 }}>{label}</Text>
    </View>
  );
};
