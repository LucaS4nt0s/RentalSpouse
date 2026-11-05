import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';

const PRESETS = [5, 10, 25, 50];

export const ServiceRadiusInput = ({
  value,
  onChange,
  hasError = false,
  disabled = false,
}) => {
  const { colors } = useAppTheme();

  const handleText = (raw) => {
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = parseInt(raw.replace(/\D/g, ''), 10);
    onChange(Number.isNaN(parsed) ? 0 : parsed);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.inputBg,
            borderColor: hasError ? colors.error : colors.borderGlass,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={value === 0 ? '' : String(value)}
          onChangeText={handleText}
          keyboardType="numeric"
          placeholder="10"
          placeholderTextColor={colors.muted}
          editable={!disabled}
          maxLength={3}
          accessibilityLabel="Raio de atendimento em quilômetros"
        />
        <Text style={[styles.unit, { color: colors.textSecondary }]}>km</Text>
      </View>

      <View style={styles.presets}>
        {PRESETS.map((preset) => {
          const active = value === preset;
          return (
            <TouchableOpacity
              key={preset}
              activeOpacity={0.8}
              disabled={disabled}
              onPress={() => onChange(preset)}
              style={[
                styles.preset,
                {
                  borderColor: active ? colors.gold : colors.borderGlass,
                  backgroundColor: active ? colors.gold : 'transparent',
                },
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: active ? colors.textDark : colors.textSecondary },
                ]}
              >
                {preset} km
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    minWidth: 130,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  unit: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preset: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
});
