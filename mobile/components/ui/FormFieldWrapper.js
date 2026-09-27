import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const FormFieldWrapper = ({
  label,
  required = false,
  hint,
  error,
  children,
  style,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {label} {required && <Text style={[styles.requiredStar, { color: colors.error }]}>*</Text>}
          </Text>
          {hint && !error && <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text>}
        </View>
      )}

      {children}

      {error && (
        <View style={styles.errorRow}>
          <AlertCircle size={12} color={colors.error} style={styles.errorIcon} />
          <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requiredStar: {
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  errorIcon: {
    marginRight: 4,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
