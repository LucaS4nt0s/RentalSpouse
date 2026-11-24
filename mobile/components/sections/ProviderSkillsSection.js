import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { PhoneInput } from '../ui/PhoneInput';
import { SpecialtiesChips } from '../ui/SpecialtiesChips';
import { ServiceRadiusInput } from '../ui/ServiceRadiusInput';
import { BioTextarea } from '../ui/BioTextarea';
import { Colors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';
import { MIN_BIO_LENGTH, MAX_BIO_LENGTH } from '../../utils/validators';

export const ProviderSkillsSection = ({
  data,
  errors = {},
  onChange,
  onBlur,
  disabled = false,
}) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceGlass, borderColor: colors.borderGlass },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.borderGlass }]}>
        <View style={styles.badgeIcon}>
          <Text style={styles.iconText}>🛠️</Text>
        </View>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            4. Perfil Profissional
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Especialidades, área de atendimento e apresentação
          </Text>
        </View>
      </View>

      {/* Telefone */}
      <FormFieldWrapper
        label="Telefone / WhatsApp"
        required
        hint="Com DDD"
        error={errors.telefone}
      >
        <PhoneInput
          value={data.telefone}
          onChangeText={(val) => onChange('telefone', val)}
          onBlur={() => onBlur && onBlur('telefone')}
          hasError={Boolean(errors.telefone)}
          editable={!disabled}
        />
      </FormFieldWrapper>

      {/* Especialidades */}
      <FormFieldWrapper
        label="Especialidades"
        required
        hint="Selecione uma ou mais"
        error={errors.especialidades}
      >
        <SpecialtiesChips
          value={data.especialidades}
          onChange={(next) => onChange('especialidades', next)}
          hasError={Boolean(errors.especialidades)}
          disabled={disabled}
        />
      </FormFieldWrapper>

      {/* Raio de Atendimento */}
      <FormFieldWrapper
        label="Raio de Atendimento"
        required
        hint="Em quilômetros"
        error={errors.raioAtendimento}
      >
        <ServiceRadiusInput
          value={data.raioAtendimento}
          onChange={(value) => onChange('raioAtendimento', value)}
          hasError={Boolean(errors.raioAtendimento)}
          disabled={disabled}
        />
      </FormFieldWrapper>

      {/* Biografia */}
      <FormFieldWrapper
        label="Biografia"
        required
        hint={`${MIN_BIO_LENGTH} a ${MAX_BIO_LENGTH} caracteres`}
        error={errors.bio}
      >
        <BioTextarea
          placeholder="Conte um pouco sobre sua experiência, formação e tipos de serviço que realiza..."
          value={data.bio}
          onChangeText={(val) => onChange('bio', val)}
          onBlur={() => onBlur && onBlur('bio')}
          hasError={Boolean(errors.bio)}
          editable={!disabled}
        />
      </FormFieldWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(232, 209, 142, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232, 209, 142, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: {
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textLight,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.sand,
  },
});
