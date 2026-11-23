/**
 * Gerenciador centralizado com contagem de referências para bloqueio de rolagem do <body>.
 *
 * Resolve o bug em que modais sobrepostos ou reabertos em sequência (ex.:
 * AvaliacoesProfissionalModal -> AvaliarProfissionalModal -> QuoteModal)
 * capturam `originalOverflow = 'hidden'` ou restauram o overflow de forma
 * conflitante, deixando a rolagem vertical da página travada (issue #96).
 */

export interface ScrollLockTarget {
  style: {
    overflow: string;
    removeProperty?: (property: string) => string;
  };
}

let activeLocks = 0;
let savedOverflow = '';

function resolveTarget(target?: ScrollLockTarget | null): ScrollLockTarget | null {
  if (target) return target;
  if (typeof document !== 'undefined' && document.body) {
    return document.body;
  }
  return null;
}

function restoreOverflow(body: ScrollLockTarget): void {
  if (savedOverflow && savedOverflow !== 'hidden') {
    body.style.overflow = savedOverflow;
  } else if (typeof body.style.removeProperty === 'function') {
    body.style.removeProperty('overflow');
  } else {
    body.style.overflow = '';
  }
  savedOverflow = '';
}

/**
 * Adquire um lock de scroll no <body> e retorna uma função de liberação idempotente.
 * O overflow original só é restaurado quando o último modal ativo for fechado.
 */
export function acquireBodyScrollLock(target?: ScrollLockTarget | null): () => void {
  const body = resolveTarget(target);
  if (!body) {
    return () => {};
  }

  if (activeLocks === 0) {
    const current = body.style.overflow || '';
    savedOverflow = current === 'hidden' ? '' : current;
    body.style.overflow = 'hidden';
  }
  activeLocks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;

    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) {
      restoreOverflow(body);
    }
  };
}

/** Retorna quantos locks de scroll estão ativos no momento (útil para diagnóstico e testes). */
export function getActiveBodyScrollLockCount(): number {
  return activeLocks;
}

/** Reinicia o estado interno do gerenciador (exclusivo para isolamento em testes unitários). */
export function resetBodyScrollLockState(): void {
  activeLocks = 0;
  savedOverflow = '';
}
