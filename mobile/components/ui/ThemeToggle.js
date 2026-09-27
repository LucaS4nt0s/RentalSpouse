import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Sun, Moon } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const ThemeToggle = ({ style, showLabel = true }) => {
  const { isDark, colors, toggleTheme } = useAppTheme();
  const Icon = isDark ? Sun : Moon;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggleTheme}
      accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      style={[
        styles.button,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Icon size={14} color={colors.primary} />
      {showLabel && (
        <Text style={[styles.text, { color: colors.muted }]}>
          {isDark ? 'Claro' : 'Escuro'}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
