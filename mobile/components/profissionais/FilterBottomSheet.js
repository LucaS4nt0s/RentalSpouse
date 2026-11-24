import React, { useState, useEffect } from 'react';
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
import { X, MapPin, SlidersHorizontal } from 'lucide-react-native';
import { useAppTheme } from '../../theme/ThemeContext';

export const FilterBottomSheet = ({
  visible,
  onClose,
  initialCity = '',
  onApply,
  onReset,
}) => {
  const { colors } = useAppTheme();
  const [city, setCity] = useState(initialCity);

  // Sincroniza o estado interno sempre que o bottom sheet abrir ou a prop mudar
  useEffect(() => {
    if (visible) {
      setCity(initialCity || '');
    }
  }, [visible, initialCity]);

  const handleApply = () => {
    onApply({ city: city.trim() });
    onClose();
  };

  const handleReset = () => {
    setCity('');
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
                    Filtrar por Cidade
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
                    placeholder="Ex: São Paulo, Campinas, Niterói..."
                    placeholderTextColor={colors.textSoft}
                    value={city}
                    onChangeText={setCity}
                    autoFocus={Platform.OS !== 'ios'}
                  />
                  {city ? (
                    <TouchableOpacity onPress={() => setCity('')}>
                      <X size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
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
                    Aplicar Filtro
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
    marginBottom: 20,
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
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
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
