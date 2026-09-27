/**
 * Utilitários puros de formatação e máscaras para o RentalSpouse.
 */

/**
 * Remove qualquer caractere que não seja dígito numérico.
 */
export function cleanDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Aplica a máscara de CPF: 000.000.000-00
 */
export function maskCPF(value: string): string {
  const digits = cleanDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Aplica a máscara de CEP: 00000-000
 */
export function maskCEP(value: string): string {
  const digits = cleanDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

/**
 * Aplica a máscara de Data: DD/MM/AAAA
 */
export function maskDate(value: string): string {
  const digits = cleanDigits(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Converte data de DD/MM/AAAA para YYYY-MM-DD (ISO) para o backend
 */
export function formatDateToISO(dateStr: string): string {
  const clean = dateStr.trim();
  if (clean.includes('/')) {
    const [day, month, year] = clean.split('/');
    if (day && month && year && year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }
  return clean;
}

/**
 * Converte data de YYYY-MM-DD para DD/MM/AAAA
 */
export function formatISODateToBR(isoStr: string): string {
  const clean = isoStr.trim();
  if (clean.includes('-')) {
    const [year, month, day] = clean.split('-');
    if (day && month && year) {
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }
  return clean;
}
