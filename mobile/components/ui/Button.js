import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const Button = ({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}) => {
  const { colors } = useAppTheme();
  const isPrimary = variant === 'primary';
  const isGlass = variant === 'glass';
  const isOutline = variant === 'outline';

  const containerStyles = [
    styles.base,
    size === 'sm' && styles.sizeSm,
    size === 'md' && styles.sizeMd,
    size === 'lg' && styles.sizeLg,
    isPrimary && styles.primaryBtn,
    isPrimary && { backgroundColor: colors.primary, shadowColor: colors.primary },
    isGlass && styles.glassBtn,
    isGlass && { backgroundColor: colors.surface2, borderColor: colors.border },
    isOutline && styles.outlineBtn,
    isOutline && { borderColor: colors.primary },
    (disabled || isLoading) && styles.disabledBtn,
    style,
  ];

  const textStyles = [
    styles.baseText,
    size === 'sm' && styles.textSm,
    size === 'md' && styles.textMd,
    size === 'lg' && styles.textLg,
    isPrimary && { color: colors.primaryText },
    isGlass && { color: colors.textPrimary },
    isOutline && { color: colors.primary },
    textStyle,
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || isLoading}
      style={containerStyles}
    >
      {isLoading ? (
        <View style={styles.row}>
          <ActivityIndicator
            size="small"
            color={isPrimary ? colors.primaryText : colors.primary}
          />
          <Text style={[...textStyles, styles.gapLeft]}>
            {loadingText || children}
          </Text>
        </View>
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <Text style={textStyles}>{children}</Text>
          {rightIcon}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSm: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sizeMd: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sizeLg: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryBtn: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  glassBtn: {
    borderWidth: 1,
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  baseText: {
    fontWeight: '700',
    textAlign: 'center',
  },
  textSm: {
    fontSize: 12,
  },
  textMd: {
    fontSize: 14,
  },
  textLg: {
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  gapLeft: {
    marginLeft: 8,
  },
});
