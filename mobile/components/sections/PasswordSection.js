import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock, Check } from 'lucide-react-native';
import { FormFieldWrapper } from '../ui/FormFieldWrapper';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';
import { usePasswordStrength } from '../../hooks/usePasswordStrength';
import { useAppTheme } from '../../theme/ThemeContext';

export const PasswordSection = ({
  data,
  errors = {},
  onChange,
  onBlur,
  disabled = false,
}) => {
  const { colors } = useAppTheme();
  const passwordEvaluation = usePasswordStrength(data.senha);

  const hasConfirmation = Boolean(data.confirmacaoSenha);
  const passwordsMatch = hasConfirmation && data.senha === data.confirmacaoSenha;
  const passwordsMismatch = hasConfirmation && data.senha !== data.confirmacaoSenha;

  const confirmationError =
    errors.confirmacaoSenha || (passwordsMismatch ? 'As senhas não coincidem.' : undefined);

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
          <Lock size={16} color={colors.primary} />
        </View>
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            3. Segurança & Senha
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Credencial exclusiva de acesso à sua conta
          </Text>
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
            <Check size={13} color={colors.success} />
            <Text style={[styles.matchText, { color: colors.success }]}>
              Senhas coincidem
            </Text>
          </View>
        )}
      </View>
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
  confirmWrapper: {
    marginTop: 14,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -6,
    marginBottom: 8,
    gap: 4,
  },
  matchText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
