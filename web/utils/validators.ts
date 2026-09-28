/**
 * Utilitários puros de validação para o formulário de cadastro do RentalSpouse.
 * Em conformidade estrita com o PRD (PRD_Frontend_Clientes_Form.md) e AI_RULES.md.
 */

export interface PasswordCriteriaStatus {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export type PasswordStrengthLevel = 'weak' | 'moderate' | 'strong';

export interface PasswordStrengthResult {
  score: number;
  criteria: PasswordCriteriaStatus;
  strength: PasswordStrengthLevel;
  label: string;
  color: string;
  percentage: number;
  isValid: boolean;
}

export const VALID_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type UF = (typeof VALID_UFS)[number];

/**
 * Valida o Nome Completo:
 * - Mínimo 3 e máximo 120 caracteres
 * - Apenas letras e acentos
 * - Requer pelo menos nome e sobrenome (não permite apenas primeiro nome)
 */
export function validateFullName(name: string): { isValid: boolean; message?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { isValid: false, message: 'O nome completo é obrigatório.' };
  }
  if (trimmed.length < 3) {
    return { isValid: false, message: 'O nome deve ter no mínimo 3 caracteres.' };
  }
  if (trimmed.length > 120) {
    return { isValid: false, message: 'O nome deve ter no máximo 120 caracteres.' };
  }
  const nameRegex = /^[a-zA-ZÀ-ÿ\s]+$/;
  if (!nameRegex.test(trimmed)) {
    return { isValid: false, message: 'O nome deve conter apenas letras e acentos.' };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { isValid: false, message: 'Informe o nome e o sobrenome completos.' };
  }
  return { isValid: true };
}

/**
 * Valida o E-mail de acordo com RFC 5322 simplificado.
 */
export function validateEmail(email: string): { isValid: boolean; message?: string } {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { isValid: false, message: 'O e-mail é obrigatório.' };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, message: 'Digite um formato de e-mail válido (ex: nome@dominio.com).' };
  }
  return { isValid: true };
}

/**
 * Validação algorítmica estrita do CPF brasileiro:
 * - 11 dígitos
 * - Rejeita números repetidos (ex: 111.111.111-11)
 * - Validação matemática de DV1 e DV2
 */
export function validateCPF(rawCpf: string): { isValid: boolean; message?: string } {
  const cpf = rawCpf.replace(/\D/g, '');
  if (!cpf) {
    return { isValid: false, message: 'O CPF é obrigatório.' };
  }
  if (cpf.length !== 11) {
    return { isValid: false, message: 'O CPF deve conter exatamente 11 dígitos numéricos.' };
  }
  // Rejeita sequências repetidas
  if (/^(\d)\1{10}$/.test(cpf)) {
    return { isValid: false, message: 'CPF inválido. Verifique os números digitados.' };
  }

  // Validação DV1
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) {
    return { isValid: false, message: 'CPF inválido. Verifique os números digitados.' };
  }

  // Validação DV2
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10), 10)) {
    return { isValid: false, message: 'CPF inválido. Verifique os números digitados.' };
  }

  return { isValid: true };
}

/**
 * Valida a Data de Nascimento:
 * - Aceita formato DD/MM/AAAA ou AAAA-MM-DD
 * - Data no passado
 * - Mínimo 18 anos completos hoje
 * - Máximo 120 anos
 */
export function validateBirthDate(dateStr: string): { isValid: boolean; message?: string } {
  if (!dateStr || !dateStr.trim()) {
    return { isValid: false, message: 'A data de nascimento é obrigatória.' };
  }

  let year: number;
  let month: number;
  let day: number;

  const clean = dateStr.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length !== 3) {
      return { isValid: false, message: 'Data inválida. Use o formato DD/MM/AAAA.' };
    }
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length !== 3) {
      return { isValid: false, message: 'Data inválida.' };
    }
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else {
    return { isValid: false, message: 'Data inválida. Use o formato DD/MM/AAAA.' };
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return { isValid: false, message: 'Data de nascimento inválida no calendário.' };
  }

  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return { isValid: false, message: 'Data inexistente no calendário.' };
  }

  const today = new Date();
  if (birthDate > today) {
    return { isValid: false, message: 'A data de nascimento deve estar no passado.' };
  }

  // Cálculo da idade precisa
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 18) {
    return {
      isValid: false,
      message: 'É necessário ter pelo menos 18 anos para se cadastrar no RentalSpouse.',
    };
  }

  if (age > 120) {
    return { isValid: false, message: 'Idade informada excede o limite aceito (máximo 120 anos).' };
  }

  return { isValid: true };
}

/**
 * Validação em tempo real dos 5 critérios de Senha Forte:
 * 1. Mínimo 8 caracteres
 * 2. Pelo menos 1 letra maiúscula
 * 3. Pelo menos 1 letra minúscula
 * 4. Pelo menos 1 número
 * 5. Pelo menos 1 caractere especial
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const criteria: PasswordCriteriaStatus = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const score = Object.values(criteria).filter(Boolean).length;

  let strength: PasswordStrengthLevel = 'weak';
  let label = 'Senha fraca';
  let color = '#EF4444'; // Red
  let percentage = 33;

  if (score >= 5) {
    strength = 'strong';
    label = 'Senha forte e segura';
    color = '#e8d18e'; // Soft Gold
    percentage = 100;
  } else if (score >= 3) {
    strength = 'moderate';
    label = 'Senha moderada';
    color = '#bab195'; // Warm Sand
    percentage = 66;
  } else {
    strength = 'weak';
    label = 'Senha fraca';
    color = '#EF4444';
    percentage = 33;
  }

  return {
    score,
    criteria,
    strength,
    label,
    color,
    percentage,
    isValid: score === 5,
  };
}

/**
 * Valida a confirmação de senha
 */
export function validatePasswordMatch(password: string, confirmPassword: string): { isValid: boolean; message?: string } {
  if (!confirmPassword) {
    return { isValid: false, message: 'A confirmação de senha é obrigatória.' };
  }
  if (password !== confirmPassword) {
    return { isValid: false, message: 'As senhas não coincidem.' };
  }
  return { isValid: true };
}

/**
 * Valida o CEP brasileiro: 8 dígitos numéricos
 */
export function validateCEP(cep: string): { isValid: boolean; message?: string } {
  const clean = cep.replace(/\D/g, '');
  if (!clean) {
    return { isValid: false, message: 'O CEP é obrigatório.' };
  }
  if (clean.length !== 8) {
    return { isValid: false, message: 'O CEP deve conter exatamente 8 dígitos.' };
  }
  return { isValid: true };
}

// ============================================================================
// Cadastro de Profissionais (Prestadores de Serviço)
// ============================================================================

export const SPECIALTIES = [
  'Elétrica',
  'Hidráulica',
  'Pintura',
  'Montagem de Móveis',
  'Marcenaria',
  'Limpeza',
  'Jardinagem',
  'Ar-condicionado',
  'Reparos Gerais',
] as const;

export type Specialty = (typeof SPECIALTIES)[number];

export const MIN_SERVICE_RADIUS_KM = 1;
export const MAX_SERVICE_RADIUS_KM = 100;
export const MIN_BIO_LENGTH = 20;
export const MAX_BIO_LENGTH = 500;

/**
 * Valida o telefone brasileiro (fixo com 10 ou celular com 11 dígitos, com DDD).
 */
export function validatePhone(phone: string): { isValid: boolean; message?: string } {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) {
    return { isValid: false, message: 'O telefone é obrigatório.' };
  }
  if (digits.length < 10 || digits.length > 11) {
    return { isValid: false, message: 'Informe um telefone válido com DDD (10 ou 11 dígitos).' };
  }
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return { isValid: false, message: 'DDD inválido.' };
  }
  if (digits.length === 11 && digits.charAt(2) !== '9') {
    return { isValid: false, message: 'Celular inválido: o número deve iniciar com 9 após o DDD.' };
  }
  return { isValid: true };
}

/**
 * Exige ao menos 1 especialidade e rejeita valores fora do catálogo oficial.
 */
export function validateSpecialties(specialties: string[]): { isValid: boolean; message?: string } {
  if (!specialties || specialties.length < 1) {
    return { isValid: false, message: 'Selecione ao menos 1 especialidade.' };
  }
  const invalid = specialties.filter((s) => !SPECIALTIES.includes(s as Specialty));
  if (invalid.length > 0) {
    return { isValid: false, message: 'Especialidade inválida selecionada.' };
  }
  return { isValid: true };
}

/**
 * Valida o raio de atendimento em km (mínimo 1, máximo 100).
 */
export function validateServiceRadius(radius: number | string): { isValid: boolean; message?: string } {
  const value = typeof radius === 'string' ? parseFloat(radius) : radius;
  if (radius === '' || value === undefined || Number.isNaN(value)) {
    return { isValid: false, message: 'Informe o raio de atendimento.' };
  }
  if (value < MIN_SERVICE_RADIUS_KM) {
    return { isValid: false, message: `O raio mínimo é de ${MIN_SERVICE_RADIUS_KM} km.` };
  }
  if (value > MAX_SERVICE_RADIUS_KM) {
    return { isValid: false, message: `O raio máximo é de ${MAX_SERVICE_RADIUS_KM} km.` };
  }
  return { isValid: true };
}

/**
 * Valida a biografia do profissional (20 a 500 caracteres).
 */
export function validateBio(bio: string): { isValid: boolean; message?: string } {
  const trimmed = (bio || '').trim();
  if (!trimmed) {
    return { isValid: false, message: 'A biografia é obrigatória.' };
  }
  if (trimmed.length < MIN_BIO_LENGTH) {
    return { isValid: false, message: `A biografia deve ter no mínimo ${MIN_BIO_LENGTH} caracteres.` };
  }
  if (trimmed.length > MAX_BIO_LENGTH) {
    return { isValid: false, message: `A biografia deve ter no máximo ${MAX_BIO_LENGTH} caracteres.` };
  }
  return { isValid: true };
}
