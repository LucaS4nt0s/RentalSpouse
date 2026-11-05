import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const PasswordStrengthMeter = ({ evaluation }) => {
  const { colors } = useAppTheme();
  const { score, criteria, label, color } = evaluation;

  const trackColor = colors.border;
  const emptySegmentColor = colors.textSoft;

  let activeSegments = 0;
  if (score >= 5) activeSegments = 3;
  else if (score >= 3) activeSegments = 2;
  else if (score >= 1) activeSegments = 1;

  const checklist = [
    { id: '1', label: 'Mínimo de 8 caracteres', ok: criteria.hasMinLength },
    { id: '2', label: '1 letra maiúscula (A-Z)', ok: criteria.hasUppercase },
    { id: '3', label: '1 letra minúscula (a-z)', ok: criteria.hasLowercase },
    { id: '4', label: '1 número (0-9)', ok: criteria.hasNumber },
    { id: '5', label: '1 caractere especial (!@#...)', ok: criteria.hasSpecialChar },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Barra de Força Segmentada */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>
          Força da senha:
        </Text>
        <Text
          style={[
            styles.statusText,
            { color: score === 0 ? colors.muted : color },
          ]}
        >
          {score === 0 ? 'Digite sua senha' : label}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: trackColor }]}>
        {[1, 2, 3].map((seg) => {
          const isFilled = seg <= activeSegments;
          return (
            <View
              key={seg}
              style={[
                styles.segment,
                { backgroundColor: isFilled ? color : emptySegmentColor },
              ]}
            />
          );
        })}
      </View>

      {/* Checklist dos 5 Critérios */}
      <View style={[styles.checklistContainer, { borderTopColor: colors.border }]}>
        <Text style={[styles.checklistTitle, { color: colors.muted }]}>
          Requisitos Obrigatórios
        </Text>
        <View style={styles.checklistGrid}>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checkItem}>
              <View
                style={[
                  styles.checkCircle,
                  { borderColor: colors.borderStrong },
                  item.ok && styles.checkCircleOk,
                  item.ok && { backgroundColor: colors.surface2, borderColor: colors.success },
                ]}
              >
                {item.ok && <Check size={10} color={colors.success} />}
              </View>
              <Text
                style={[
                  styles.itemText,
                  item.ok
                    ? [styles.itemTextOk, { color: colors.textPrimary }]
                    : [styles.itemTextPending, { color: colors.muted }],
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    flexDirection: 'row',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 3,
  },
  checklistContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  checklistTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  checklistGrid: {
    flexDirection: 'column',
    gap: 6,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkCircleOk: {
    borderWidth: 1,
  },
  itemText: {
    fontSize: 11,
  },
  itemTextOk: {
    fontWeight: '600',
  },
  itemTextPending: {
    fontWeight: '500',
  },
});
