import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { computeSheetBox, SheetBox } from '../utils/sheetViewport';

/**
 * Boutons d'action du pied de volet : 48 px de haut et pleine largeur sur téléphone, compacts dès 640 px.
 * Dans le pied, l'ordre du code est « secondaire puis principal » : sur téléphone, le principal passe au-dessus.
 */
const SHEET_BTN_BASE = 'w-full sm:w-auto min-h-12 sm:min-h-10 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
export const SHEET_BTN_SECONDARY = `${SHEET_BTN_BASE} bg-slate-800 hover:bg-slate-700 text-slate-200`;
export const SHEET_BTN_PRIMARY = `${SHEET_BTN_BASE} bg-amber-500 hover:bg-amber-400 text-slate-950`;
export const SHEET_BTN_DANGER = `${SHEET_BTN_BASE} bg-rose-600 hover:bg-rose-500 text-white`;

const TONE_BORDER: Record<'default' | 'warning' | 'danger', string> = {
  default: 'border-slate-800',
  warning: 'border-amber-500/40',
  danger: 'border-red-700/60',
};

const MAX_WIDTH: Record<'md' | 'lg' | 'xl' | '4xl', string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '4xl': 'sm:max-w-4xl',
};

export interface KatikaSheetProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Boutons d'action : le pied reste visible pendant que le contenu défile. */
  footer?: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger';
  /** Un toucher sur le fond ferme le volet. Réservé aux fenêtres de lecture seule : jamais pour une confirmation. */
  dismissOnBackdrop?: boolean;
  maxWidth?: 'md' | 'lg' | 'xl' | '4xl';
}

/**
 * Fenêtre de katika : volet collé en bas de l'écran sur téléphone, fenêtre centrée dès 640 px.
 * Hauteur limitée à la zone visible (clavier exclu), contenu défilant, pied d'actions fixe, zone de sécurité respectée.
 */
export const KatikaSheet: React.FC<KatikaSheetProps> = ({
  title,
  onClose,
  children,
  footer,
  tone = 'default',
  dismissOnBackdrop = false,
  maxWidth = 'md',
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<SheetBox | null>(() =>
    typeof window === 'undefined' ? null : computeSheetBox(window.visualViewport)
  );

  // Le volet se cale sur la zone réellement visible : les boutons restent au-dessus du clavier.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setBox(computeSheetBox(viewport));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  // La page derrière ne défile pas pendant que le volet est ouvert.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // onClose est lu par référence : un rappel recréé à chaque rendu ne doit ni redonner le focus au volet ni rebrancher l'écoute.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const content = (
    <div
      className="fixed left-0 right-0 top-0 h-dvh z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      style={box ? { top: box.top, height: box.height } : undefined}
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${MAX_WIDTH[maxWidth]} max-h-[calc(100%-1rem)] sm:max-h-[90%] flex flex-col bg-slate-900 border ${TONE_BORDER[tone]} rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none overflow-hidden`}
      >
        <div aria-hidden="true" className="sm:hidden mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-700" />

        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-slate-800 pl-5 pr-3 py-2">
          <h2 id={titleId} className="min-w-0 text-base font-bold text-white flex items-center gap-2">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-slate-800 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
