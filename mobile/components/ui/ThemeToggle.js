import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const ThemeToggle = ({ style }) => {
  const { isDark, colors, toggleTheme } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggleTheme}
      style={[
        styles.button,
        {
          backgroundColor: colors.surfaceGlassSubtle,
          borderColor: colors.borderGlass,
        },
        style,
      ]}
    >
      <Text style={styles.icon}>{isDark ? '☀️' : '🌙'}</Text>
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        {isDark ? 'Claro' : 'Escuro'}
      </Text>
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
  icon: {
    fontSize: 13,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
