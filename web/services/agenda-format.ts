/** Extrai YYYY-MM-DD de uma string ISO naive ou aware sem deslocar o dia. */
export function extrairDataIso(iso: string): string {
  return iso.slice(0, 10);
}

/** Extrai HH:MM de uma string ISO (`YYYY-MM-DDTHH:MM:SS`). */
export function extrairHoraCurta(iso: string): string {
  const parteHora = iso.split('T')[1] ?? '';
  return parteHora.slice(0, 5);
}

/**
 * Calcula a duração em minutos entre `data_hora_inicio` e `data_hora_fim`.
 * Retorna `null` quando os timestamps forem inválidos ou fim <= início.
 */
export function calcularDuracaoMinutos(
  inicioIso: string,
  fimIso: string,
): number | null {
  const tIni = Date.parse(inicioIso);
  const tFim = Date.parse(fimIso);
  if (Number.isFinite(tIni) && Number.isFinite(tFim)) {
    const diff = Math.round((tFim - tIni) / 60000);
    return diff > 0 ? diff : null;
  }

  const [hIni, mIni] = extrairHoraCurta(inicioIso).split(':').map(Number);
  const [hFim, mFim] = extrairHoraCurta(fimIso).split(':').map(Number);
  if (!Number.isFinite(hIni) || !Number.isFinite(mIni) || !Number.isFinite(hFim) || !Number.isFinite(mFim)) {
    return null;
  }
  const diff = hFim * 60 + mFim - (hIni * 60 + mIni);
  return diff > 0 ? diff : null;
}

/** Formata `YYYY-MM-DD` para exibição amigável em pt-BR (ex: "segunda-feira, 26 de outubro de 2026"). */
export function formatarDataCompleta(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  if (!ano || !mes || !dia) return dataIso;
  const dataLocal = new Date(ano, mes - 1, dia);
  return dataLocal.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
