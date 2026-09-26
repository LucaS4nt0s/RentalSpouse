import React, { useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { TextInput } from '../ui/TextInput';
import { MaskedInput } from '../ui/MaskedInput';
import { useAddressLookup } from '../../hooks/useAddressLookup';
import { Colors } from '../../theme/colors';

export const AddressSection = ({
  data,
  errors = {},
  onChange,
  onBlur,
  disabled = false,
}) => {
  const numeroRef = useRef(null);

  const { isLoading: isLoadingCep, error: cepLookupError } = useAddressLookup(
    data.cep,
    {
      onSuccess: (result) => {
        if (result.logradouro) onChange('logradouro', result.logradouro);
        if (result.bairro) onChange('bairro', result.bairro);
        if (result.cidade) onChange('cidade', result.cidade);
        if (result.estado_uf) onChange('estado_uf', result.estado_uf);

        setTimeout(() => {
          numeroRef.current?.focus();
        }, 150);
      },
    }
  );

  const displayCepError = errors.cep || cepLookupError;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badgeIcon}>
          <Text style={styles.iconText}>📍</Text>
        </View>
        <View>
          <Text style={styles.title}>2. Endereço Principal</Text>
          <Text style={styles.subtitle}>Local onde os serviços serão realizados</Text>
        </View>
      </View>

      {/* CEP */}
      <FormFieldWrapper
        label="CEP"
        required
        hint="Busca automática de endereço"
        error={displayCepError}
      >
        <MaskedInput
          maskType="cep"
          placeholder="00000-000"
          value={data.cep}
          onChangeText={(val) => onChange('cep', val)}
          onBlur={() => onBlur && onBlur('cep')}
          hasError={Boolean(displayCepError)}
          editable={!disabled}
          keyboardType="numeric"
          maxLength={9}
          rightIcon={
            isLoadingCep ? (
              <ActivityIndicator size="small" color={Colors.gold} />
            ) : null
          }
        />
      </FormFieldWrapper>

      {/* Logradouro */}
      <FormFieldWrapper
        label="Logradouro"
        required
        error={errors.logradouro}
      >
        <TextInput
          placeholder="Rua, Avenida, Praça..."
          value={data.logradouro}
          onChangeText={(val) => onChange('logradouro', val)}
          onBlur={() => onBlur && onBlur('logradouro')}
          hasError={Boolean(errors.logradouro)}
          editable={!disabled}
          autoCapitalize="words"
        />
      </FormFieldWrapper>

      {/* Número e Complemento (Linha dupla) */}
      <View style={styles.row}>
        <View style={styles.halfCol}>
          <FormFieldWrapper
            label="Número"
            required
            hint="Ex: 123"
            error={errors.numero}
          >
            <TextInput
              ref={numeroRef}
              placeholder="123"
              value={data.numero}
              onChangeText={(val) => onChange('numero', val)}
              onBlur={() => onBlur && onBlur('numero')}
              hasError={Boolean(errors.numero)}
              editable={!disabled}
              maxLength={10}
            />
          </FormFieldWrapper>
        </View>

        <View style={styles.halfCol}>
          <FormFieldWrapper
            label="Complemento"
            hint="Opcional"
            error={errors.complemento}
          >
            <TextInput
              placeholder="Apto, Bloco"
              value={data.complemento}
              onChangeText={(val) => onChange('complemento', val)}
              editable={!disabled}
              maxLength={60}
            />
          </FormFieldWrapper>
        </View>
      </View>

      {/* Bairro */}
      <FormFieldWrapper
        label="Bairro"
        required
        error={errors.bairro}
      >
        <TextInput
          placeholder="Bairro"
          value={data.bairro}
          onChangeText={(val) => onChange('bairro', val)}
          onBlur={() => onBlur && onBlur('bairro')}
          hasError={Boolean(errors.bairro)}
          editable={!disabled}
          autoCapitalize="words"
        />
      </FormFieldWrapper>

      {/* Cidade e UF (Linha dupla) */}
      <View style={styles.row}>
        <View style={styles.twoThirdsCol}>
          <FormFieldWrapper
            label="Cidade"
            required
            error={errors.cidade}
          >
            <TextInput
              placeholder="Cidade"
              value={data.cidade}
              onChangeText={(val) => onChange('cidade', val)}
              onBlur={() => onBlur && onBlur('cidade')}
              hasError={Boolean(errors.cidade)}
              editable={!disabled}
              autoCapitalize="words"
            />
          </FormFieldWrapper>
        </View>

        <View style={styles.oneThirdCol}>
          <FormFieldWrapper
            label="UF"
            required
            hint="Sigla"
            error={errors.estado_uf}
          >
            <TextInput
              placeholder="SP"
              value={data.estado_uf}
              onChangeText={(val) => onChange('estado_uf', val.toUpperCase())}
              onBlur={() => onBlur && onBlur('estado_uf')}
              hasError={Boolean(errors.estado_uf)}
              editable={!disabled}
              autoCapitalize="characters"
              maxLength={2}
            />
          </FormFieldWrapper>
        </View>
      </View>
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfCol: {
    flex: 1,
  },
  twoThirdsCol: {
    flex: 2,
  },
  oneThirdCol: {
    flex: 1,
  },
});
