import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export const FormFieldWrapper = ({
  label,
  required = false,
  hint,
  error,
  children,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {label} {required && <Text style={styles.requiredStar}>*</Text>}
          </Text>
          {hint && !error && <Text style={styles.hint}>{hint}</Text>}
        </View>
      )}

      {children}

      {error && (
        <View style={styles.errorRow}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
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
    color: Colors.sand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requiredStar: {
    color: Colors.error,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 11,
    color: Colors.muted,
    fontStyle: 'italic',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  errorIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '600',
    flex: 1,
  },
});
