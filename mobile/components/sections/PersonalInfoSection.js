import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { TextInput } from '../ui/TextInput';
import { MaskedInput } from '../ui/MaskedInput';
import { useAppTheme } from '../../theme/ThemeContext';

export const PersonalInfoSection = ({
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
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View
          style={[
            styles.badgeIcon,
            { backgroundColor: colors.surface2, borderColor: colors.border },
          ]}
        >
          <User size={16} color={colors.primary} />
        </View>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            1. Dados Pessoais
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Identificação para orçamentos e chamados
          </Text>
        </View>
      </View>

      {/* Nome Completo */}
      <FormFieldWrapper
        label="Nome Completo"
        required
        hint="Nome e sobrenome"
        error={errors.nomeCompleto}
      >
        <TextInput
          placeholder="Ex: Carlos Eduardo dos Santos"
          value={data.nomeCompleto}
          onChangeText={(val) => onChange('nomeCompleto', val)}
          onBlur={() => onBlur && onBlur('nomeCompleto')}
          hasError={Boolean(errors.nomeCompleto)}
          editable={!disabled}
          autoCapitalize="words"
          textContentType="name"
          maxLength={120}
        />
      </FormFieldWrapper>

      {/* E-mail */}
      <FormFieldWrapper
        label="E-mail"
        required
        hint="Para avisos e ordens de serviço"
        error={errors.email}
      >
        <TextInput
          placeholder="exemplo@dominio.com.br"
          value={data.email}
          onChangeText={(val) => onChange('email', val.toLowerCase())}
          onBlur={() => onBlur && onBlur('email')}
          hasError={Boolean(errors.email)}
          editable={!disabled}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
      </FormFieldWrapper>

      {/* CPF */}
      <FormFieldWrapper
        label="CPF"
        required
        hint="11 dígitos com validação"
        error={errors.cpf}
      >
        <MaskedInput
          maskType="cpf"
          placeholder="000.000.000-00"
          value={data.cpf}
          onChangeText={(val) => onChange('cpf', val)}
          onBlur={() => onBlur && onBlur('cpf')}
          hasError={Boolean(errors.cpf)}
          editable={!disabled}
          keyboardType="numeric"
          maxLength={14}
        />
      </FormFieldWrapper>

      {/* Data de Nascimento */}
      <FormFieldWrapper
        label="Data de Nascimento"
        required
        hint="Maioridade obrigatória (18+)"
        error={errors.dataNascimento}
      >
        <MaskedInput
          maskType="date"
          placeholder="DD/MM/AAAA"
          value={data.dataNascimento}
          onChangeText={(val) => onChange('dataNascimento', val)}
          onBlur={() => onBlur && onBlur('dataNascimento')}
          hasError={Boolean(errors.dataNascimento)}
          editable={!disabled}
          keyboardType="numeric"
          maxLength={10}
        />
      </FormFieldWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  badgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
  },
});
