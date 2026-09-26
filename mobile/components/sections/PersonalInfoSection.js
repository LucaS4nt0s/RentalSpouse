import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { TextInput } from '../ui/TextInput';
import { MaskedInput } from '../ui/MaskedInput';
import { Colors } from '../../theme/colors';

export const PersonalInfoSection = ({
  data,
  errors = {},
  onChange,
  onBlur,
  disabled = false,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badgeIcon}>
          <Text style={styles.iconText}>👤</Text>
        </View>
        <View>
          <Text style={styles.title}>1. Dados Pessoais</Text>
          <Text style={styles.subtitle}>Identificação para orçamentos e chamados</Text>
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
