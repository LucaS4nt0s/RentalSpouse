import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';
import { usePasswordStrength } from '../../hooks/usePasswordStrength';
import { Colors } from '../../theme/colors';

export const PasswordSection = ({
  data,
  errors = {},
  onChange,
  onBlur,
  disabled = false,
}) => {
  const passwordEvaluation = usePasswordStrength(data.senha);

  const hasConfirmation = Boolean(data.confirmacaoSenha);
  const passwordsMatch = hasConfirmation && data.senha === data.confirmacaoSenha;
  const passwordsMismatch = hasConfirmation && data.senha !== data.confirmacaoSenha;

  const confirmationError =
    errors.confirmacaoSenha || (passwordsMismatch ? 'As senhas não coincidem.' : undefined);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badgeIcon}>
          <Text style={styles.iconText}>🔒</Text>
        </View>
        <View>
          <Text style={styles.title}>3. Segurança & Senha</Text>
          <Text style={styles.subtitle}>Credencial exclusiva de acesso à sua conta</Text>
        </View>
      </View>

      {/* Senha */}
      <FormFieldWrapper
        label="Senha Forte"
        required
        hint="5 critérios de segurança"
        error={errors.senha}
      >
        <PasswordInput
          placeholder="Digite sua senha forte"
          value={data.senha}
          onChangeText={(val) => onChange('senha', val)}
          onBlur={() => onBlur && onBlur('senha')}
          hasError={Boolean(errors.senha)}
          hasSuccess={passwordEvaluation.isValid}
          editable={!disabled}
        />
      </FormFieldWrapper>

      {/* Medidor e Checklist */}
      <PasswordStrengthMeter evaluation={passwordEvaluation} />

      {/* Confirmação de Senha */}
      <View style={styles.confirmWrapper}>
        <FormFieldWrapper
          label="Confirmar Senha"
          required
          hint="Repita a mesma senha"
          error={confirmationError}
        >
          <PasswordInput
            placeholder="Repita a senha idêntica"
            value={data.confirmacaoSenha}
            onChangeText={(val) => onChange('confirmacaoSenha', val)}
            onBlur={() => onBlur && onBlur('confirmacaoSenha')}
            hasError={Boolean(confirmationError)}
            hasSuccess={passwordsMatch && passwordEvaluation.isValid}
            editable={!disabled}
          />
        </FormFieldWrapper>

        {passwordsMatch && (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>✓ Senhas coincidem</Text>
          </View>
        )}
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
  confirmWrapper: {
    marginTop: 14,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -6,
    marginBottom: 8,
  },
  matchText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '700',
  },
});
