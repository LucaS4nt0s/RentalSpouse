import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { Colors } from '../../theme/colors';

export const Button = ({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loadingText,
  disabled = false,
  style,
  textStyle,
}) => {
  const isPrimary = variant === 'primary';
  const isGlass = variant === 'glass';
  const isOutline = variant === 'outline';

  const containerStyles = [
    styles.base,
    size === 'sm' && styles.sizeSm,
    size === 'md' && styles.sizeMd,
    size === 'lg' && styles.sizeLg,
    isPrimary && styles.primaryBtn,
    isGlass && styles.glassBtn,
    isOutline && styles.outlineBtn,
    (disabled || isLoading) && styles.disabledBtn,
    style,
  ];

  const textStyles = [
    styles.baseText,
    size === 'sm' && styles.textSm,
    size === 'md' && styles.textMd,
    size === 'lg' && styles.textLg,
    isPrimary && styles.primaryText,
    isGlass && styles.glassText,
    isOutline && styles.outlineText,
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
        <View style={styles.loadingRow}>
          <ActivityIndicator
            size="small"
            color={isPrimary ? Colors.textDark : Colors.gold}
          />
          <Text style={[...textStyles, styles.loadingTextMargin]}>
            {loadingText || children}
          </Text>
        </View>
      ) : (
        <Text style={textStyles}>{children}</Text>
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
    backgroundColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  glassBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  outlineBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.gold,
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
  primaryText: {
    color: Colors.textDark,
  },
  glassText: {
    color: Colors.textLight,
  },
  outlineText: {
    color: Colors.gold,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTextMargin: {
    marginLeft: 8,
  },
});
