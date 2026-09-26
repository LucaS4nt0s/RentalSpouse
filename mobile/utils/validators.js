export const VALID_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export function validateFullName(name = '') {
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

export function validateEmail(email = '') {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { isValid: false, message: 'O e-mail é obrigatório.' };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, message: 'Digite um formato de e-mail válido.' };
  }
  return { isValid: true };
}

export function validateCPF(rawCpf = '') {
  const cpf = rawCpf.replace(/\D/g, '');
  if (!cpf) {
    return { isValid: false, message: 'O CPF é obrigatório.' };
  }
  if (cpf.length !== 11) {
    return { isValid: false, message: 'O CPF deve conter exatamente 11 dígitos.' };
  }
  if (/^(\d)\1{10}$/.test(cpf)) {
    return { isValid: false, message: 'CPF inválido. Verifique os números digitados.' };
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) {
    return { isValid: false, message: 'CPF inválido. Verifique os números digitados.' };
  }

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

export function validateBirthDate(dateStr = '') {
  if (!dateStr || !dateStr.trim()) {
    return { isValid: false, message: 'A data de nascimento é obrigatória.' };
  }

  let year, month, day;
  const clean = dateStr.trim();
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length !== 3) return { isValid: false, message: 'Use DD/MM/AAAA.' };
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    return { isValid: false, message: 'Use o formato DD/MM/AAAA.' };
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return { isValid: false, message: 'Data inválida no calendário.' };
  }

  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) {
    return { isValid: false, message: 'Data inexistente no calendário.' };
  }

  const today = new Date();
  if (birthDate > today) {
    return { isValid: false, message: 'A data deve estar no passado.' };
  }

  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 18) {
    return { isValid: false, message: 'É necessário ter pelo menos 18 anos para se cadastrar.' };
  }

  if (age > 120) {
    return { isValid: false, message: 'Idade inválida (máximo 120 anos).' };
  }

  return { isValid: true };
}

export function evaluatePasswordStrength(password = '') {
  const criteria = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const score = Object.values(criteria).filter(Boolean).length;

  let strength = 'weak';
  let label = 'Senha fraca';
  let color = '#EF4444';

  if (score >= 5) {
    strength = 'strong';
    label = 'Senha forte e segura';
    color = '#e8d18e';
  } else if (score >= 3) {
    strength = 'moderate';
    label = 'Senha moderada';
    color = '#bab195';
  }

  return {
    score,
    criteria,
    strength,
    label,
    color,
    isValid: score === 5,
  };
}

export function validatePasswordMatch(password = '', confirmPassword = '') {
  if (!confirmPassword) {
    return { isValid: false, message: 'A confirmação de senha é obrigatória.' };
  }
  if (password !== confirmPassword) {
    return { isValid: false, message: 'As senhas não coincidem.' };
  }
  return { isValid: true };
}

export function validateCEP(cep = '') {
  const clean = cep.replace(/\D/g, '');
  if (!clean) return { isValid: false, message: 'O CEP é obrigatório.' };
  if (clean.length !== 8) return { isValid: false, message: 'O CEP deve ter 8 dígitos.' };
  return { isValid: true };
}
