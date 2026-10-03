import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, MapPin, SlidersHorizontal, Check } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const FilterBottomSheet = ({
  visible,
  onClose,
  initialCity = '',
  initialRadius = null,
  onApply,
  onReset,
}) => {
  const { colors } = useAppTheme();
  const [city, setCity] = useState(initialCity);
  const [radius, setRadius] = useState(initialRadius);

  const radiusOptions = [
    { label: 'Qualquer raio', value: null },
    { label: 'Até 10 km', value: 10 },
    { label: 'Até 25 km', value: 25 },
    { label: 'Até 50 km', value: 50 },
    { label: 'Até 100 km', value: 100 },
  ];

  const handleApply = () => {
    onApply({ city: city.trim(), radius });
    onClose();
  };

  const handleReset = () => {
    setCity('');
    setRadius(null);
    if (onReset) onReset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  borderTopColor: colors.border,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.titleRow}>
                  <SlidersHorizontal size={18} color={colors.primary} />
                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Filtros Avançados
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityLabel="Fechar filtros"
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Cidade */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                  Cidade de Atendimento
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    {
                      backgroundColor: colors.surface2,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <MapPin size={16} color={colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="Ex: São Paulo, Campinas..."
                    placeholderTextColor={colors.textSoft}
                    value={city}
                    onChangeText={setCity}
                  />
                  {city ? (
                    <TouchableOpacity onPress={() => setCity('')}>
                      <X size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Raio */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textPrimary }]}>
                  Raio Máximo de Deslocamento
                </Text>
                <View style={styles.radiusOptions}>
                  {radiusOptions.map((opt) => {
                    const isSelected = radius === opt.value;
                    return (
                      <TouchableOpacity
                        key={String(opt.value)}
                        onPress={() => setRadius(opt.value)}
                        style={[
                          styles.radiusChip,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.surface2,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        {isSelected && (
                          <Check size={14} color={colors.primaryText} style={{ marginRight: 4 }} />
                        )}
                        <Text
                          style={[
                            styles.radiusText,
                            {
                              color: isSelected ? colors.primaryText : colors.textSecondary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={handleReset}
                  style={[styles.resetBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.resetText, { color: colors.textSecondary }]}>
                    Limpar
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleApply}
                  style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.applyText, { color: colors.primaryText }]}>
                    Aplicar Filtros
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  radiusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  radiusText: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  resetBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
