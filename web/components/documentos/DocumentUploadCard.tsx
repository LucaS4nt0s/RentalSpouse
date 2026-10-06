'use client';

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  DocumentTypeMeta,
  ProfessionalDocument,
} from '../../types/professionalDocuments';
import { resolveApiUrl } from '../../services/professionalDocuments';
import { Button } from '../ui/Button';

interface DocumentUploadCardProps {
  config: DocumentTypeMeta;
  document?: ProfessionalDocument;
  isLocked: boolean;
  onUpload: (file: File) => Promise<void>;
  onDelete?: (documentId: number) => Promise<void>;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export const DocumentUploadCard: React.FC<DocumentUploadCardProps> = ({
  config,
  document,
  isLocked,
  onUpload,
  onDelete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateAndUpload = async (file: File) => {
    setValidationError(null);

    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setValidationError(
        `Formato de arquivo inválido (${ext}). Formatos aceitos: ${ALLOWED_EXTENSIONS.join(', ')}.`,
      );
      return;
    }

    if (file.size <= 0) {
      setValidationError('O arquivo selecionado está vazio (0 bytes).');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError('O arquivo excede o limite máximo permitido de 10 MB.');
      return;
    }

    try {
      setIsLoading(true);
      await onUpload(file);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao realizar upload do documento.';
      setValidationError(message);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLocked && !isLoading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLocked || isLoading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndUpload(file);
    }
  };

  const handleDelete = async () => {
    if (!document || isLocked || isLoading || !onDelete) return;

    const confirmDelete = window.confirm(
      `Deseja realmente remover o documento "${document.file_name}"?`,
    );
    if (!confirmDelete) return;

    try {
      setIsLoading(true);
      setValidationError(null);
      await onDelete(document.id);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Falha ao excluir o documento.';
      setValidationError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const isPdf =
    document?.mime_type === 'application/pdf' ||
    document?.file_name.toLowerCase().endsWith('.pdf');

  return (
    <div className="rounded-2xl border border-rental-border bg-rental-surface p-5 sm:p-6 shadow-panel transition-all flex flex-col justify-between">
      {/* Header do Card */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-bold text-rental-ink">
              {config.title}
            </h4>
            {document && (
              <span title="Documento anexado">
                <CheckCircle2 className="h-5 w-5 text-[var(--rs-success)] shrink-0" />
              </span>
            )}
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold shrink-0 ${
              config.required
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                : 'bg-rental-surface2 text-rental-muted border border-rental-border'
            }`}
          >
            {config.required ? 'Obrigatório' : 'Opcional'}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-rental-muted mb-4 leading-relaxed">
          {config.description}
        </p>
      </div>

      {/* Alerta de Erro de Validação */}
      {validationError && (
        <div className="mb-4 rounded-xl border border-[var(--rs-error)]/30 bg-[var(--rs-error)]/10 p-3 text-xs text-[var(--rs-error)] flex items-start gap-2 animate-fadeIn">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">{validationError}</span>
        </div>
      )}

      {/* Estado com Documento Anexado */}
      {document ? (
        <div className="rounded-xl border border-rental-border bg-rental-surface2 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-rental-surface border border-rental-border text-rental-primary shrink-0">
              {isPdf ? (
                <FileText className="h-6 w-6 text-red-500" />
              ) : (
                <ImageIcon className="h-6 w-6 text-blue-500" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-semibold text-rental-ink truncate"
                title={document.file_name}
              >
                {document.file_name}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rental-muted mt-0.5">
                <span>{formatFileSize(document.file_size)}</span>
                <span>•</span>
                <span>Enviado em {formatDate(document.uploaded_at)}</span>
              </div>
            </div>
          </div>

          {/* Ações do Documento Anexado */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rental-border/60">
            {document.download_url ? (
              <a
                href={resolveApiUrl(document.download_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rental-primary hover:underline py-1"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Visualizar / Baixar</span>
              </a>
            ) : (
              <span className="text-xs text-rental-muted">Arquivo salvo</span>
            )}

            {!isLocked && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs py-1.5 px-3"
                >
                  Substituir
                </Button>

                {onDelete && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={isLoading}
                    onClick={handleDelete}
                    className="text-xs py-1.5 px-2.5"
                    title="Excluir documento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Estado sem Documento Anexado (Dropzone) */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition-all flex flex-col items-center justify-center gap-3 ${
            isLocked
              ? 'border-rental-border/40 bg-rental-surface2/30 cursor-not-allowed opacity-70'
              : isDragging
              ? 'border-rental-primary bg-rental-primary/5 scale-[1.01]'
              : 'border-rental-border hover:border-rental-primary/50 bg-rental-surface2/50'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-8 w-8 animate-spin text-rental-primary" />
              <p className="text-xs font-medium text-rental-ink">
                Enviando documento com segurança...
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-full bg-rental-surface border border-rental-border text-rental-muted">
                <UploadCloud className="h-6 w-6 text-rental-primary" />
              </div>

              <div>
                <p className="text-sm font-semibold text-rental-ink">
                  {isLocked
                    ? 'Submissão em análise'
                    : 'Arraste o arquivo aqui ou clique para selecionar'}
                </p>
                <p className="text-xs text-rental-muted mt-1">
                  {config.acceptedFormatsText}
                </p>
              </div>

              {!isLocked && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1"
                >
                  Selecionar Arquivo
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {/* Input File Oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={config.acceptMimeTypes}
        onChange={handleFileChange}
        className="hidden"
        disabled={isLocked || isLoading}
        aria-label={`Upload para ${config.title}`}
      />
    </div>
  );
};
