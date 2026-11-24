import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { SPECIALTIES } from '../../utils/validators';

export const SpecialtiesChips = ({
  value = [],
  onChange,
  hasError = false,
  disabled = false,
}) => {
  const { colors } = useAppTheme();

  const toggle = (specialty) => {
    if (disabled) return;
    if (value.includes(specialty)) {
      onChange(value.filter((item) => item !== specialty));
    } else {
      onChange([...value, specialty]);
    }
  };

  return (
    <View style={styles.container}>
      {SPECIALTIES.map((specialty) => {
        const active = value.includes(specialty);
        return (
          <TouchableOpacity
            key={specialty}
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => toggle(specialty)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              {
                borderColor: active ? colors.gold : hasError ? colors.error : colors.borderGlass,
                backgroundColor: active ? colors.gold : 'transparent',
              },
              disabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.textDark : colors.textSecondary },
              ]}
            >
              {specialty}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
});
