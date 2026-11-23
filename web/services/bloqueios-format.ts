/**
 * Helpers puros de validação e formatação para bloqueios pontuais de agenda (issue #16).
 */

export interface BloqueioAgenda {
  id: number;
  professional_id: number;
  data_hora_inicio: string;
  data_hora_fim: string;
  motivo: string | null;
  created_at: string;
}

export interface BloqueioAgendaCreatePayload {
  data_hora_inicio: string;
  data_hora_fim: string;
  motivo?: string | null;
}

export interface BloqueioFormInput {
  data: string; // YYYY-MM-DD
  diaInteiro: boolean;
  horaInicio?: string; // HH:MM
  horaFim?: string; // HH:MM
  motivo?: string;
}

export type ResultadoValidacaoBloqueio =
  | { ok: true; payload: BloqueioAgendaCreatePayload }
  | { ok: false; erro: string };

const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_CURTA_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MOTIVO_BLOQUEIO_MAX_CHARS = 255;

/** Soma `dias` a uma data `YYYY-MM-DD` sem desvios de fuso horário local. */
export function somarDiasDataIso(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const dt = new Date(Date.UTC(ano, mes - 1, dia + dias));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Valida os campos do formulário e monta o payload esperado por `POST /api/agendamentos/bloqueios`. */
export function montarPayloadBloqueio(input: BloqueioFormInput): ResultadoValidacaoBloqueio {
  const data = (input.data || '').trim();
  if (!DATA_ISO_REGEX.test(data)) {
    return { ok: false, erro: 'Selecione uma data válida para o bloqueio.' };
  }

  const [ano, mes, dia] = data.split('-').map(Number);
  const checagem = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    checagem.getUTCFullYear() !== ano ||
    checagem.getUTCMonth() + 1 !== mes ||
    checagem.getUTCDate() !== dia
  ) {
    return { ok: false, erro: 'A data informada não existe no calendário.' };
  }

  const motivoLimpo = (input.motivo || '').trim();
  if (motivoLimpo.length > MOTIVO_BLOQUEIO_MAX_CHARS) {
    return {
      ok: false,
      erro: `O motivo deve ter no máximo ${MOTIVO_BLOQUEIO_MAX_CHARS} caracteres.`,
    };
  }

  if (input.diaInteiro) {
    const proximoDia = somarDiasDataIso(data, 1);
    return {
      ok: true,
      payload: {
        data_hora_inicio: `${data}T00:00:00`,
        data_hora_fim: `${proximoDia}T00:00:00`,
        motivo: motivoLimpo || null,
      },
    };
  }

  const horaInicio = (input.horaInicio || '').trim();
  const horaFim = (input.horaFim || '').trim();

  if (!HORA_CURTA_REGEX.test(horaInicio) || !HORA_CURTA_REGEX.test(horaFim)) {
    return { ok: false, erro: 'Informe horários válidos de início e término (HH:MM).' };
  }

  if (horaFim <= horaInicio) {
    return { ok: false, erro: 'O horário de término deve ser posterior ao horário de início.' };
  }

  return {
    ok: true,
    payload: {
      data_hora_inicio: `${data}T${horaInicio}:00`,
      data_hora_fim: `${data}T${horaFim}:00`,
      motivo: motivoLimpo || null,
    },
  };
}

/** Verifica se o bloqueio cobre um dia inteiro (00:00 até 00:00 do dia seguinte ou 23:59). */
export function ehBloqueioDiaInteiro(
  bloqueio: Pick<BloqueioAgenda, 'data_hora_inicio' | 'data_hora_fim'>,
): boolean {
  const [dataIni, horaIniRaw] = bloqueio.data_hora_inicio.split('T');
  const [dataFim, horaFimRaw] = bloqueio.data_hora_fim.split('T');
  if (!dataIni || !horaIniRaw || !dataFim || !horaFimRaw) return false;

  const horaIni = horaIniRaw.slice(0, 5);
  const horaFim = horaFimRaw.slice(0, 5);

  if (horaIni === '00:00' && horaFim === '00:00' && dataFim === somarDiasDataIso(dataIni, 1)) {
    return true;
  }
  if (horaIni === '00:00' && horaFim === '23:59' && dataFim === dataIni) {
    return true;
  }
  return false;
}

/** Formata data ISO `YYYY-MM-DD` em `DD/MM/YYYY` (pt-BR). */
export function formatarDataBr(dataIso: string): string {
  const parteData = dataIso.split('T')[0];
  const [ano, mes, dia] = parteData.split('-');
  if (!ano || !mes || !dia) return parteData;
  return `${dia}/${mes}/${ano}`;
}

/** Formata o resumo legível de um bloqueio em pt-BR para exibição nos cards. */
export function formatarPeriodoBloqueio(
  bloqueio: Pick<BloqueioAgenda, 'data_hora_inicio' | 'data_hora_fim'>,
): { tituloData: string; faixaHorario: string; diaInteiro: boolean } {
  const diaInteiro = ehBloqueioDiaInteiro(bloqueio);
  const dataIni = bloqueio.data_hora_inicio.split('T')[0];
  const dataFim = bloqueio.data_hora_fim.split('T')[0];
  const horaIni = (bloqueio.data_hora_inicio.split('T')[1] || '').slice(0, 5);
  const horaFim = (bloqueio.data_hora_fim.split('T')[1] || '').slice(0, 5);

  if (diaInteiro) {
    return {
      tituloData: formatarDataBr(dataIni),
      faixaHorario: 'Dia inteiro',
      diaInteiro: true,
    };
  }

  if (dataIni === dataFim) {
    return {
      tituloData: formatarDataBr(dataIni),
      faixaHorario: `${horaIni} às ${horaFim}`,
      diaInteiro: false,
    };
  }

  return {
    tituloData: `${formatarDataBr(dataIni)} a ${formatarDataBr(dataFim)}`,
    faixaHorario: `${horaIni} até ${horaFim}`,
    diaInteiro: false,
  };
}
