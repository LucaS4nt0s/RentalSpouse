import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';

export const PasswordStrengthMeter = ({ evaluation }) => {
  const { score, criteria, label, color } = evaluation;

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
    <View style={styles.container}>
      {/* Barra de Força Segmentada */}
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Força da senha:</Text>
        <Text style={[styles.statusText, { color: score === 0 ? Colors.muted : color }]}>
          {score === 0 ? 'Digite sua senha' : label}
        </Text>
      </View>

      <View style={styles.track}>
        {[1, 2, 3].map((seg) => {
          const isFilled = seg <= activeSegments;
          return (
            <View
              key={seg}
              style={[
                styles.segment,
                { backgroundColor: isFilled ? color : 'rgba(98, 105, 112, 0.25)' },
              ]}
            />
          );
        })}
      </View>

      {/* Checklist dos 5 Critérios */}
      <View style={styles.checklistContainer}>
        <Text style={styles.checklistTitle}>Requisitos Obrigatórios</Text>
        <View style={styles.checklistGrid}>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checkItem}>
              <View
                style={[
                  styles.checkCircle,
                  item.ok && styles.checkCircleOk,
                ]}
              >
                <Text style={styles.checkIconText}>{item.ok ? '✓' : ''}</Text>
              </View>
              <Text
                style={[
                  styles.itemText,
                  item.ok ? styles.itemTextOk : styles.itemTextPending,
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
    backgroundColor: Colors.surfaceGlassSubtle,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLabel: {
    fontSize: 11,
    color: Colors.sand,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    flexDirection: 'row',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  checklistTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.muted,
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
    borderColor: 'rgba(98, 105, 112, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkCircleOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: Colors.success,
  },
  checkIconText: {
    fontSize: 9,
    color: Colors.success,
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: 11,
  },
  itemTextOk: {
    color: Colors.textLight,
    fontWeight: '600',
  },
  itemTextPending: {
    color: Colors.muted,
  },
});
