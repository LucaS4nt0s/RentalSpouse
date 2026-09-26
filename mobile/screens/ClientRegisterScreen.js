import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { PersonalInfoSection } from '../components/sections/PersonalInfoSection';
import { AddressSection } from '../components/sections/AddressSection';
import { PasswordSection } from '../components/sections/PasswordSection';
import { Button } from '../components/ui/Button';
import {
  validateFullName,
  validateEmail,
  validateCPF,
  validateBirthDate,
  evaluatePasswordStrength,
  validatePasswordMatch,
  validateCEP,
} from '../utils/validators';
import { cleanDigits, formatDateToISO } from '../utils/formatters';

const BASE_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export const ClientRegisterScreen = ({ onNavigateBack }) => {
  const scrollRef = useRef(null);

  // Estados dos Dados
  const [personalData, setPersonalData] = useState({
    nomeCompleto: '',
    email: '',
    cpf: '',
    dataNascimento: '',
  });

  const [addressData, setAddressData] = useState({
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado_uf: '',
  });

  const [passwordData, setPasswordData] = useState({
    senha: '',
    confirmacaoSenha: '',
  });

  // Estados de Erro
  const [personalErrors, setPersonalErrors] = useState({});
  const [addressErrors, setAddressErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});

  // Estados Globais de UI (Loading, Error, Success)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  // Handlers de Mudança
  const handlePersonalChange = (field, value) => {
    setPersonalData((prev) => ({ ...prev, [field]: value }));
    if (personalErrors[field]) {
      setPersonalErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  const handleAddressChange = (field, value) => {
    setAddressData((prev) => ({ ...prev, [field]: value }));
    if (addressErrors[field]) {
      setAddressErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  const handlePasswordChange = (field, value) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    if (passwordErrors[field]) {
      setPasswordErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (globalError) setGlobalError(null);
  };

  // Validação em Blur
  const handlePersonalBlur = (field) => {
    if (field === 'nomeCompleto' && personalData.nomeCompleto) {
      const res = validateFullName(personalData.nomeCompleto);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, nomeCompleto: res.message }));
    } else if (field === 'email' && personalData.email) {
      const res = validateEmail(personalData.email);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, email: res.message }));
    } else if (field === 'cpf' && personalData.cpf) {
      const res = validateCPF(personalData.cpf);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, cpf: res.message }));
    } else if (field === 'dataNascimento' && personalData.dataNascimento) {
      const res = validateBirthDate(personalData.dataNascimento);
      if (!res.isValid) setPersonalErrors((prev) => ({ ...prev, dataNascimento: res.message }));
    }
  };

  const handleAddressBlur = (field) => {
    if (field === 'cep' && addressData.cep) {
      const res = validateCEP(addressData.cep);
      if (!res.isValid) setAddressErrors((prev) => ({ ...prev, cep: res.message }));
    }
  };

  const handlePasswordBlur = (field) => {
    if (field === 'confirmacaoSenha' && passwordData.confirmacaoSenha) {
      const res = validatePasswordMatch(passwordData.senha, passwordData.confirmacaoSenha);
      if (!res.isValid) setPasswordErrors((prev) => ({ ...prev, confirmacaoSenha: res.message }));
    }
  };

  // Validação Geral antes de Enviar
  const validateForm = () => {
    let hasError = false;

    // 1. Dados Pessoais
    const newPersonal = {};
    const nameV = validateFullName(personalData.nomeCompleto);
    if (!nameV.isValid) { newPersonal.nomeCompleto = nameV.message; hasError = true; }
    const emailV = validateEmail(personalData.email);
    if (!emailV.isValid) { newPersonal.email = emailV.message; hasError = true; }
    const cpfV = validateCPF(personalData.cpf);
    if (!cpfV.isValid) { newPersonal.cpf = cpfV.message; hasError = true; }
    const birthV = validateBirthDate(personalData.dataNascimento);
    if (!birthV.isValid) { newPersonal.dataNascimento = birthV.message; hasError = true; }
    setPersonalErrors(newPersonal);

    // 2. Endereço
    const newAddress = {};
    const cepV = validateCEP(addressData.cep);
    if (!cepV.isValid) { newAddress.cep = cepV.message; hasError = true; }
    if (!addressData.logradouro || addressData.logradouro.trim().length < 3) {
      newAddress.logradouro = 'Logradouro é obrigatório (mínimo 3 letras).';
      hasError = true;
    }
    if (!addressData.numero || addressData.numero.trim().length < 1) {
      newAddress.numero = 'Número é obrigatório.';
      hasError = true;
    }
    if (!addressData.bairro || addressData.bairro.trim().length < 2) {
      newAddress.bairro = 'Bairro é obrigatório.';
      hasError = true;
    }
    if (!addressData.cidade || addressData.cidade.trim().length < 2) {
      newAddress.cidade = 'Cidade é obrigatória.';
      hasError = true;
    }
    if (!addressData.estado_uf) {
      newAddress.estado_uf = 'Informe a UF.';
      hasError = true;
    }
    setAddressErrors(newAddress);

    // 3. Senha Forte
    const newPassword = {};
    const strV = evaluatePasswordStrength(passwordData.senha);
    if (!strV.isValid) {
      newPassword.senha = 'A senha deve cumprir todos os 5 critérios.';
      hasError = true;
    }
    const matchV = validatePasswordMatch(passwordData.senha, passwordData.confirmacaoSenha);
    if (!matchV.isValid) {
      newPassword.confirmacaoSenha = matchV.message;
      hasError = true;
    }
    setPasswordErrors(newPassword);

    return !hasError;
  };

  // Envio do Cadastro
  const handleSubmit = async () => {
    setGlobalError(null);

    const valid = validateForm();
    if (!valid) {
      setGlobalError({
        type: 'validation',
        message: 'Por favor, revise os campos destacados em vermelho.',
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    setIsSubmitting(true);

    const payload = {
      nome_completo: personalData.nomeCompleto.trim(),
      email: personalData.email.trim().toLowerCase(),
      cpf: cleanDigits(personalData.cpf),
      data_nascimento: formatDateToISO(personalData.dataNascimento),
      senha: passwordData.senha,
      endereco: {
        cep: cleanDigits(addressData.cep),
        logradouro: addressData.logradouro.trim(),
        numero: addressData.numero.trim(),
        complemento: addressData.complemento.trim() || undefined,
        bairro: addressData.bairro.trim(),
        cidade: addressData.cidade.trim(),
        estado_uf: addressData.estado_uf.trim().toUpperCase(),
      },
    };

    try {
      const response = await fetch(`${BASE_API_URL}/api/v1/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const result = await response.json();
        setSuccessData(result);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      if (response.status === 409) {
        const errorJson = await response.json();
        setGlobalError({
          type: 'conflict',
          message: errorJson.detail || 'Este CPF ou E-mail já possui cadastro.',
        });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      if (response.status === 422) {
        const errorJson = await response.json();
        const msg = errorJson.detail?.[0]?.msg || 'Dados inválidos fornecidos.';
        setGlobalError({
          type: 'validation',
          message: `Erro de validação: ${msg}`,
        });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }

      throw new Error(`Erro status ${response.status}`);
    } catch (err) {
      setGlobalError({
        type: 'network',
        message:
          'Não foi possível conectar ao servidor RentalSpouse. Verifique sua conexão e tente novamente.',
      });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render do Estado 3: Sucesso
  if (successData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <View style={styles.successContainer}>
          <View style={styles.successIconBox}>
            <Text style={styles.successCheckIcon}>✓</Text>
          </View>

          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>Cadastro Realizado com Sucesso</Text>
          </View>

          <Text style={styles.successTitle}>Bem-vindo ao RentalSpouse!</Text>
          <Text style={styles.successSubtitle}>
            Olá, <Text style={styles.goldText}>{successData.nome_completo}</Text>! Sua conta
            está pronta para solicitar manutenções e reparos.
          </Text>

          <View style={styles.successInfoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID do Cliente:</Text>
              <Text style={styles.infoValue}>#{successData.id}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>E-mail:</Text>
              <Text style={styles.infoValue}>{successData.email}</Text>
            </View>
            <View style={styles.infoRowNoBorder}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={styles.activeStatusText}>Ativa & Verificada</Text>
            </View>
          </View>

          <View style={styles.successActions}>
            <Button
              variant="primary"
              size="lg"
              onPress={() => Alert.alert('RentalSpouse', 'Módulo de chamados em breve!')}
            >
              Solicitar um Serviço Agora
            </Button>

            {onNavigateBack && (
              <Button
                variant="glass"
                size="md"
                style={{ marginTop: 10 }}
                onPress={onNavigateBack}
              >
                Voltar à Tela Inicial
              </Button>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const { isDark, colors } = useAppTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Barra Superior com Voltar e Alternador de Tema */}
          <View style={styles.topBar}>
            {onNavigateBack ? (
              <TouchableOpacity
                onPress={onNavigateBack}
                style={[
                  styles.backButton,
                  {
                    backgroundColor: colors.surfaceGlass,
                    borderColor: colors.borderGlass,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={[styles.backButtonText, { color: colors.textPrimary }]}>
                  ← Voltar
                </Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            <ThemeToggle />
          </View>

          {/* Header Mobile */}
          <View style={styles.header}>
            <View style={styles.brandBadge}>
              <View style={styles.badgeDot} />
              <Text style={styles.brandBadgeText}>RentalSpouse Mobile</Text>
            </View>

            <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
              Cadastro de Cliente
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              Crie sua conta e tenha acesso aos melhores profissionais para manutenção e reparos
            </Text>
          </View>

          {/* Banner de Erro Global (Estado 2: Error) */}
          {globalError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerTitle}>
                {globalError.type === 'conflict'
                  ? 'Registro Já Existente'
                  : globalError.type === 'network'
                  ? 'Falha de Conexão'
                  : 'Atenção ao Preenchimento'}
              </Text>
              <Text style={styles.errorBannerMessage}>{globalError.message}</Text>
              {globalError.type === 'network' && (
                <TouchableOpacity
                  onPress={handleSubmit}
                  style={styles.retryBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryBtnText}>Tentar Novamente</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Seção 1: Dados Pessoais */}
          <PersonalInfoSection
            data={personalData}
            errors={personalErrors}
            onChange={handlePersonalChange}
            onBlur={handlePersonalBlur}
            disabled={isSubmitting}
          />

          {/* Seção 2: Endereço */}
          <AddressSection
            data={addressData}
            errors={addressErrors}
            onChange={handleAddressChange}
            onBlur={handleAddressBlur}
            disabled={isSubmitting}
          />

          {/* Seção 3: Credenciais & Senha Forte */}
          <PasswordSection
            data={passwordData}
            errors={passwordErrors}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            disabled={isSubmitting}
          />

          {/* Botão de Envio (Estado 1: Loading) */}
          <View style={styles.footerContainer}>
            <Button
              variant="primary"
              size="lg"
              isLoading={isSubmitting}
              loadingText="Cadastrando cliente..."
              onPress={handleSubmit}
            >
              Finalizar Cadastro
            </Button>
            <Text style={styles.footerTerms}>
              Ao se cadastrar, você concorda com os Termos de Uso e Política de Privacidade do
              RentalSpouse.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  backButtonText: {
    color: Colors.sand,
    fontSize: 13,
    fontWeight: '700',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 209, 142, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232, 209, 142, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
    marginRight: 6,
  },
  brandBadgeText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 12,
    color: Colors.sand,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerTitle: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '700',
  },
  errorBannerMessage: {
    color: Colors.textLight,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: Colors.error,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  footerContainer: {
    marginTop: 10,
    gap: 12,
  },
  footerTerms: {
    fontSize: 11,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 15,
  },
  // Estilos de Sucesso
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(232, 209, 142, 0.15)',
    borderWidth: 2,
    borderColor: Colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successCheckIcon: {
    fontSize: 32,
    color: Colors.gold,
    fontWeight: 'bold',
  },
  successBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  successBadgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textLight,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    color: Colors.sand,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  goldText: {
    color: Colors.gold,
    fontWeight: '700',
  },
  successInfoCard: {
    width: '100%',
    backgroundColor: Colors.surfaceGlass,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoRowNoBorder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.muted,
  },
  infoValue: {
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '600',
  },
  activeStatusText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '700',
  },
  successActions: {
    width: '100%',
    marginTop: 24,
  },
});
