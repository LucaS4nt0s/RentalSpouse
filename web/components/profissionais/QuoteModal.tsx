'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  X,
  Phone,
  Mail,
  Send,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Professional } from '../../types/professional';
import { useAuth } from '../../context/AuthContext';
import { criarOrcamento } from '../../services/orcamentos';

interface QuoteModalProps {
  professional: Professional | null;
  onClose: () => void;
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_SIZE_MB = 5;
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function maskEmail(email?: string | null): string {
  if (!email || !email.includes('@')) return 'E-mail protegido';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

function maskPhone(phone?: string | null): string {
  if (!phone) return 'Telefone protegido';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return 'Telefone protegido';
  return phone.replace(/(\d{2,3})\D*(\d{1})\d+(\d{2})$/, '$1 $2****-**$3');
}

export function QuoteModal({ professional, onClose }: QuoteModalProps) {
  const { user, token, isAuthenticated } = useAuth();

  const [quoteMessage, setQuoteMessage] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quoteSuccess, setQuoteSuccess] = useState<boolean>(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Se o usuário estiver logado, pré-preenche dados
  useEffect(() => {
    if (user) {
      setClientName(user.nome || user.name || '');
      setClientEmail(user.email || '');
    }
  }, [user]);

  // Limpa previews ao desmontar
  useEffect(() => {
    return () => {
      photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photoPreviews]);

  // Focus trap e controle de teclado (Acessibilidade)
  useEffect(() => {
    if (!professional) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const focusTimeout = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [professional]);

  if (!professional) return null;

  const handlePhotoSelect = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    setErrorMessage(null);

    const selectedFiles = Array.from(filesList);
    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    for (const file of selectedFiles) {
      if (photos.length + newFiles.length >= MAX_PHOTOS) {
        setErrorMessage(`Limite máximo de ${MAX_PHOTOS} fotos atingido.`);
        break;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        setErrorMessage(`O arquivo '${file.name}' possui formato inválido. Use JPEG, PNG ou WebP.`);
        continue;
      }

      if (file.size > MAX_PHOTO_SIZE_BYTES) {
        setErrorMessage(`O arquivo '${file.name}' excede o tamanho máximo de ${MAX_PHOTO_SIZE_MB} MB.`);
        continue;
      }

      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    if (newFiles.length > 0) {
      setPhotos((prev) => [...prev, ...newFiles]);
      setPhotoPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const handleRemovePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (quoteMessage.trim().length < 10) {
      setErrorMessage('Por favor, descreva o serviço com pelo menos 10 caracteres.');
      return;
    }

    if (!isAuthenticated) {
      if (!clientName.trim() || clientName.trim().length < 2) {
        setErrorMessage('Por favor, informe seu nome completo.');
        return;
      }
      if (!clientEmail.trim() || !clientEmail.includes('@')) {
        setErrorMessage('Por favor, informe um e-mail válido para contato.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await criarOrcamento(
        {
          professional_id: professional.id,
          descricao: quoteMessage,
          cliente_nome: clientName,
          cliente_email: clientEmail,
          cliente_telefone: clientPhone,
          fotos: photos,
        },
        token
      );

      setQuoteSuccess(true);
      setTimeout(() => {
        onClose();
        setQuoteSuccess(false);
        setQuoteMessage('');
        setPhotos([]);
        setPhotoPreviews([]);
      }, 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao solicitar orçamento.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl rounded-3xl glass-panel p-6 shadow-2xl relative my-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-rental-muted hover:text-rental-ink hover:bg-rental-surface2 transition-colors disabled:opacity-50"
          aria-label="Fechar modal de orçamento"
        >
          <X className="h-5 w-5" />
        </button>

        {quoteSuccess ? (
          <div className="flex flex-col items-center py-8 text-center animate-scaleCheck">
            <CheckCircle2 className="h-16 w-16 text-rental-success mb-3" />
            <h3 className="text-2xl font-bold text-rental-ink">Solicitação Enviada!</h3>
            <p className="mt-2 text-sm text-rental-muted max-w-md">
              O profissional <strong>{professional.name}</strong> recebeu sua solicitação em tempo real e entrará em contato com a estimativa de valor.
            </p>
            {photos.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-rental-primary">
                ✓ {photos.length} foto(s) anexada(s) com sucesso.
              </p>
            )}
            <div className="mt-5 flex flex-col sm:flex-row items-center gap-2">
              <Link
                href="/cliente/orcamentos"
                onClick={onClose}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-rental-primary px-4 py-2 text-xs font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-all"
              >
                Acompanhar Meus Orçamentos
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-rental-border px-4 py-2 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rental-primary/10 text-rental-primary font-bold text-base">
                {professional.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 id="quote-modal-title" className="text-lg font-bold text-rental-ink">
                  Solicitar Orçamento
                </h3>
                <p className="text-xs text-rental-muted">
                  Para {professional.name} • {professional.city || 'Atendimento local'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {professional.specialties.map((spec) => (
                <span
                  key={spec}
                  className="rounded-lg bg-rental-surface2 px-2.5 py-1 text-xs font-semibold text-rental-muted"
                >
                  {spec}
                </span>
              ))}
            </div>

            {errorMessage && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Identificação do Cliente (se não logado) */}
              {!isAuthenticated ? (
                <div className="rounded-2xl border border-rental-border/60 bg-rental-surface2/40 p-3.5 space-y-3">
                  <span className="block text-xs font-bold text-rental-ink">
                    Seus dados de contato:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <input
                        type="text"
                        required
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="w-full rounded-xl glass-input px-3 py-2 text-xs placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        required
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="seu-email@exemplo.com"
                        className="w-full rounded-xl glass-input px-3 py-2 text-xs placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40"
                      />
                    </div>
                  </div>
                  <div>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="WhatsApp / Telefone com DDD (opcional)"
                      className="w-full rounded-xl glass-input px-3 py-2 text-xs placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl bg-rental-surface2/50 px-3 py-2 text-xs text-rental-muted">
                  <span>Solicitante autenticado:</span>
                  <strong className="text-rental-ink">{user?.nome || user?.name} ({user?.email})</strong>
                </div>
              )}

              {/* Descrição do Problema */}
              <div>
                <label
                  htmlFor="quote-message-input"
                  className="block text-xs font-bold text-rental-ink mb-1.5"
                >
                  Descreva o serviço ou problema:
                </label>
                <textarea
                  id="quote-message-input"
                  ref={textareaRef}
                  required
                  rows={3}
                  value={quoteMessage}
                  onChange={(e) => setQuoteMessage(e.target.value)}
                  placeholder="Ex: Preciso trocar a fiação da sala e consertar o disjuntor que está desarmando..."
                  className="w-full rounded-2xl glass-input p-3 text-xs sm:text-sm placeholder:text-rental-muted focus:outline-none focus:ring-2 focus:ring-rental-primary/40 resize-none"
                />
              </div>

              {/* Upload de Fotos do Problema (Issue #22) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-rental-ink flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-rental-primary" />
                    Fotos do problema (opcional):
                  </label>
                  <span className="text-[11px] text-rental-muted">
                    {photos.length}/{MAX_PHOTOS} anexadas (máx {MAX_PHOTO_SIZE_MB}MB cada)
                  </span>
                </div>

                {/* Dropzone */}
                {photos.length < MAX_PHOTOS && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rental-border hover:border-rental-primary/60 bg-rental-surface2/30 hover:bg-rental-surface2/60 p-4 cursor-pointer transition-colors"
                  >
                    <Upload className="h-5 w-5 text-rental-primary mb-1" />
                    <p className="text-xs font-semibold text-rental-ink">
                      Clique para adicionar fotos do local ou problema
                    </p>
                    <p className="text-[10px] text-rental-muted mt-0.5">
                      Formatos aceitos: JPEG, PNG, WebP
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoSelect(e.target.files)}
                    />
                  </div>
                )}

                {/* Grid de Miniaturas com Botão de Excluir */}
                {photoPreviews.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-5 gap-2">
                    {photoPreviews.map((previewUrl, idx) => (
                      <div
                        key={idx}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-rental-border bg-rental-surface2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt={`Foto ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remover foto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Informações de Proteção de Contato */}
              <div className="flex items-center justify-between gap-3 text-xs text-rental-muted pt-1 border-t border-rental-border/40">
                <span className="flex items-center gap-1" title="Contato protegido">
                  <Phone className="h-3.5 w-3.5 text-rental-primary" />
                  {maskPhone(professional.phone)}
                </span>
                <span className="flex items-center gap-1" title="Contato protegido">
                  <Mail className="h-3.5 w-3.5 text-rental-primary" />
                  {maskEmail(professional.email)}
                </span>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-rental-border px-4 py-2.5 text-xs font-semibold text-rental-muted hover:text-rental-ink transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-rental-primary px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-primary hover:bg-[var(--rs-primary-hover)] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enviando orçamento...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Enviar Solicitação</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
