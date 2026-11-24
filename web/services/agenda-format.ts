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

export interface StatusPermissaoCancelamento {
  podeCancelar: boolean;
  motivo?: string;
  horasRestantes: number;
}

/**
 * Valida a regra de cancelamento (Issue #24):
 * Permite cancelamento apenas se faltar no mínimo 24 horas para o início do agendamento
 * e o horário não tiver ocorrido.
 */
export function verificarPermissaoCancelamento(
  dataHoraInicioIso: string,
  agora: Date = new Date(),
): StatusPermissaoCancelamento {
  const tInicio = Date.parse(dataHoraInicioIso);
  if (!Number.isFinite(tInicio)) {
    return {
      podeCancelar: false,
      motivo: 'Data de início inválida.',
      horasRestantes: 0,
    };
  }

  const diffMs = tInicio - agora.getTime();
  const horasRestantes = diffMs / (1000 * 60 * 60);

  if (horasRestantes <= 0) {
    return {
      podeCancelar: false,
      motivo: 'Não é possível cancelar um agendamento que já ocorreu ou está em andamento.',
      horasRestantes,
    };
  }

  if (horasRestantes < 24) {
    return {
      podeCancelar: false,
      motivo: 'Cancelamentos só são permitidos com no mínimo 24 horas de antecedência.',
      horasRestantes,
    };
  }

  return {
    podeCancelar: true,
    horasRestantes,
  };
}

export const MAX_JANELAS_POR_GRADE = 50;

export const DIAS_SEMANA_PT: ReadonlyArray<{
  dia: number;
  nome: string;
  curto: string;
}> = [
  { dia: 0, nome: 'Segunda-feira', curto: 'Seg' },
  { dia: 1, nome: 'Terça-feira', curto: 'Ter' },
  { dia: 2, nome: 'Quarta-feira', curto: 'Qua' },
  { dia: 3, nome: 'Quinta-feira', curto: 'Qui' },
  { dia: 4, nome: 'Sexta-feira', curto: 'Sex' },
  { dia: 5, nome: 'Sábado', curto: 'Sáb' },
  { dia: 6, nome: 'Domingo', curto: 'Dom' },
];

/** Normaliza strings `HH:MM:SS` ou `HH:MM` para `HH:MM`. */
export function normalizarHoraCurta(hora: string): string {
  return hora.trim().slice(0, 5);
}

/** Converte `HH:MM` (ou `HH:MM:SS`) em minutos desde 00:00. */
export function converterHoraParaMinutos(hora: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(hora.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** Calcula quantos slots inteiros cabem em uma janela semanal. */
export function calcularQuantidadeSlots(
  horaInicio: string,
  horaFim: string,
  duracaoSlotMin: number,
): number {
  const ini = converterHoraParaMinutos(horaInicio);
  const fim = converterHoraParaMinutos(horaFim);
  if (ini === null || fim === null || fim <= ini || duracaoSlotMin <= 0) {
    return 0;
  }
  return Math.floor((fim - ini) / duracaoSlotMin);
}

export interface JanelaDisponibilidadeInput {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  duracao_slot_min: number;
}

/**
 * Valida a grade semanal antes do envio ao backend (`PUT /api/agendamentos/disponibilidade`),
 * espelhando as mesmas regras de `DisponibilidadeCreate` e `_validar_sobreposicao_grade`.
 */
export function validarGradeDisponibilidade(
  janelas: JanelaDisponibilidadeInput[],
): string | null {
  if (janelas.length > MAX_JANELAS_POR_GRADE) {
    return `A grade pode conter no máximo ${MAX_JANELAS_POR_GRADE} janelas.`;
  }

  const porDia = new Map<
    number,
    Array<{ ini: number; fim: number; horaInicio: string; horaFim: string }>
  >();

  for (const janela of janelas) {
    const infoDia = DIAS_SEMANA_PT.find((d) => d.dia === janela.dia_semana);
    if (!infoDia) {
      return 'Dia da semana inválido.';
    }

    const ini = converterHoraParaMinutos(janela.hora_inicio);
    const fim = converterHoraParaMinutos(janela.hora_fim);
    if (ini === null || fim === null) {
      return `Informe horários válidos (HH:MM) em ${infoDia.nome}.`;
    }
    if (fim <= ini) {
      return `Em ${infoDia.nome}, o horário final (${normalizarHoraCurta(janela.hora_fim)}) deve ser posterior ao inicial (${normalizarHoraCurta(janela.hora_inicio)}).`;
    }

    const duracao = Number(janela.duracao_slot_min);
    if (!Number.isInteger(duracao) || duracao < 5 || duracao > 480) {
      return `Em ${infoDia.nome}, a duração do atendimento deve ficar entre 5 e 480 minutos.`;
    }
    if (fim - ini < duracao) {
      return `Em ${infoDia.nome}, a janela ${normalizarHoraCurta(janela.hora_inicio)}–${normalizarHoraCurta(janela.hora_fim)} é menor que a duração de ${duracao} minutos.`;
    }

    const lista = porDia.get(janela.dia_semana) ?? [];
    lista.push({
      ini,
      fim,
      horaInicio: normalizarHoraCurta(janela.hora_inicio),
      horaFim: normalizarHoraCurta(janela.hora_fim),
    });
    porDia.set(janela.dia_semana, lista);
  }

  for (const [dia, lista] of Array.from(porDia.entries())) {
    const ordenadas = [...lista].sort((a, b) => a.ini - b.ini);
    for (let i = 1; i < ordenadas.length; i++) {
      const anterior = ordenadas[i - 1];
      const atual = ordenadas[i];
      if (atual.ini < anterior.fim) {
        const nomeDia = DIAS_SEMANA_PT[dia]?.nome ?? 'este dia';
        return `As janelas ${anterior.horaInicio}–${anterior.horaFim} e ${atual.horaInicio}–${atual.horaFim} se sobrepõem em ${nomeDia}.`;
      }
    }
  }

  return null;
}
