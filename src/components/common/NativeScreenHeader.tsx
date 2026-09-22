import React from 'react';
import { ArrowLeft, Volume2, VolumeX, Home } from 'lucide-react';

/**
 * ============================================================================
 * RÉFÉRENCE DE STYLE UNIFIÉE — TOKENS DES BOUTONS DE HEADER
 * ============================================================================
 * Ce bloc définit les tokens visuels canoniques pour tous les boutons
 * secondaires de header dans l'application (NativeScreenHeader, et comme
 * socle de référence pour la migration du header de HomeScreen) :
 *
 * 1. Hauteur commune : `h-9` (36px, cible tactile minimale garantie mobile/PWA)
 * 2. Rayon d'arrondi : `rounded-xl` (12px, standard unifié sur tous les écrans)
 * 3. Surface & Fond  : `bg-slate-800/90 hover:bg-slate-700`
 * 4. Bordure         : `border border-slate-700/80`
 * 5. Interactions    : `cursor-pointer active:scale-95 shadow-sm transition-all duration-150 shrink-0`
 * ============================================================================
 */
export const HEADER_BUTTON_BASE_CLASSES =
  'h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 transition-all duration-150 active:scale-95 shadow-sm cursor-pointer shrink-0';

export interface NativeScreenHeaderProps {
  /** Label for screen back button (default: "Retour") */
  backLabel?: string;
  /** Custom action on back click */
  onBack?: () => void;
  /** Optional custom left element (e.g. logo) when onBack is not provided */
  leftContent?: React.ReactNode;
  /** Accessible title tooltip for back button */
  backTitle?: string;
  /** Optional badge next to back button (e.g. "Partie en cours", "En ligne") */
  contextBadge?: React.ReactNode;
  /** Main screen title */
  title: React.ReactNode;
  /** Optional subtitle below title */
  subtitle?: React.ReactNode;
  /** Optional sound toggle handler (unified across all headers) */
  onToggleSound?: () => void;
  /** Is sound currently enabled */
  soundEnabled?: boolean;
  /** Optional home action to quickly return to root (e.g. from deep views) */
  onHome?: () => void;
  /** Optional extra actions on the right (e.g. settings, share) */
  rightActions?: React.ReactNode;
  /** Optional unique HTML ID */
  id?: string;
  /** Optional custom class name */
  className?: string;
}

/**
 * Unified native top application header for Njambo Kora.
 * Enforces Option A (Icon + [Retour] text), fixed height (h-14 sm:h-16),
 * unified obsidian surface, and unified sound controls.
 */
export const NativeScreenHeader: React.FC<NativeScreenHeaderProps> = ({
  backLabel = 'Retour',
  onBack,
  leftContent,
  backTitle = 'Retour',
  contextBadge,
  title,
  subtitle,
  onToggleSound,
  soundEnabled = true,
  onHome,
  rightActions,
  id = 'native-screen-header',
  className = '',
}) => {
  return (
    <header
      id={id}
      className={`shrink-0 h-14 sm:h-16 px-2.5 sm:px-6 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between gap-2 shadow-lg z-30 select-none ${className}`}
    >
      {/* Left zone: Return button + optional context badge */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-9 px-2.5 sm:px-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-amber-300 hover:text-amber-200 border border-slate-700/80 transition-all duration-150 flex items-center gap-1.5 cursor-pointer font-bold text-xs sm:text-sm shadow-sm shrink-0"
            title={backTitle}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="tracking-tight max-w-[85px] sm:max-w-none truncate">{backLabel}</span>
          </button>
        ) : leftContent ? (
          leftContent
        ) : null}

        {contextBadge && <div className="shrink-0">{contextBadge}</div>}
      </div>

      {/* Center zone: Title and optional Subtitle */}
      <div className="flex-1 text-center truncate px-1 flex flex-col items-center justify-center min-w-0 max-w-full">
        {typeof title === 'string' ? (
          <h1 className="text-xs sm:text-sm md:text-base font-black tracking-tight uppercase text-white truncate drop-shadow-xs max-w-full">
            {title}
          </h1>
        ) : (
          <div className="max-w-full truncate flex items-center justify-center">{title}</div>
        )}
        {subtitle && (
          <div className="text-[11px] text-slate-400 font-medium truncate hidden xs:block max-w-full">
            {subtitle}
          </div>
        )}
      </div>

      {/* Right zone: Unified Sound Toggle + Contextual Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {onToggleSound && (
          <button
            type="button"
            onClick={onToggleSound}
            className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700/80 transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 shadow-sm shrink-0"
            title={soundEnabled ? 'Couper les sons du jeu' : 'Activer les sons du jeu'}
            aria-label={soundEnabled ? 'Couper le son' : 'Activer le son'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-amber-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>
        )}

        {onHome && (
          <button
            type="button"
            onClick={onHome}
            className="w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 border border-slate-700/80 transition-all duration-150 flex items-center justify-center cursor-pointer active:scale-95 shadow-sm shrink-0"
            title="Retour à l'accueil"
            aria-label="Retour à l'accueil"
          >
            <Home className="w-4 h-4 text-emerald-400" />
          </button>
        )}

        {rightActions}
      </div>
    </header>
  );
};
