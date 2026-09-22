import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PlayerAvatar } from './PlayerAvatar';
import { usePlayerProfile } from '../../context/PlayerProfileContext';
import { HonorificTitle, PlayerProfile } from '../../types/playerProfile';

export type HeaderProfileButtonVariant = 'pill' | 'compact';

export interface HeaderProfileButtonProps {
  /** Click handler to open the profile modal */
  onClick?: () => void;
  /** Visual variant: 'pill' shows avatar + name + chevron; 'compact' shows avatar only */
  variant?: HeaderProfileButtonVariant;
  /** Whether to show the display name next to the avatar (default: true for 'pill', false for 'compact') */
  showName?: boolean;
  /** Whether to show the chevron icon (default: true for 'pill', false for 'compact') */
  showChevron?: boolean;
  /** Size of the PlayerAvatar (default: 'xs') */
  avatarSize?: 'xs' | 'sm' | 'md';
  /** Whether to display the online status dot on the avatar (default: true) */
  showStatusDot?: boolean;
  /** Custom HTML id attribute */
  id?: string;
  /** Accessible title tooltip */
  title?: string;
  /** Accessible aria-label */
  ariaLabel?: string;
  /** Optional custom CSS classes to merge or override default styling */
  className?: string;
  /** Optional override for profile data */
  profile?: PlayerProfile;
  /** Optional override for login status */
  isLoggedIn?: boolean;
  /** Optional override for honorific title */
  currentTitle?: HonorificTitle;
}

/**
 * Unified Header Profile Button for Njambo Kora.
 * Encapsulates PlayerAvatar with status dot and interactive triggers
 * across HomeScreen, GameHeader, and NativeScreenHeader rightActions.
 */
export const HeaderProfileButton: React.FC<HeaderProfileButtonProps> = ({
  onClick,
  variant = 'pill',
  showName,
  showChevron,
  avatarSize = 'xs',
  showStatusDot = true,
  id,
  title,
  ariaLabel = 'Mon Profil & Palmarès',
  className,
  profile: propProfile,
  isLoggedIn: propIsLoggedIn,
  currentTitle: propCurrentTitle,
}) => {
  const profileContext = usePlayerProfile();

  const safeProfile = propProfile || profileContext?.profile;
  const safeIsLoggedIn = propIsLoggedIn !== undefined ? propIsLoggedIn : (profileContext?.isLoggedIn ?? false);
  const safeCurrentTitle = propCurrentTitle || profileContext?.currentTitle;

  const isPill = variant === 'pill';
  const shouldShowName = showName !== undefined ? showName : isPill;
  const shouldShowChevron = showChevron !== undefined ? showChevron : isPill;

  const defaultId = isPill ? 'btn-header-profile' : 'btn-game-header-profile';
  const elementId = id || defaultId;

  const defaultTitle = isPill
    ? 'Mon Profil & Palmarès'
    : safeIsLoggedIn
    ? `Connecté: ${safeProfile?.displayName || 'Joueur'}`
    : 'Mon Profil (Invité)';
  const elementTitle = title || defaultTitle;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick();
    } else if (profileContext?.setIsProfileModalOpen) {
      profileContext.setIsProfileModalOpen(true);
    }
  };

  const baseClasses = isPill
    ? 'h-9 pl-1.5 pr-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-700/80 hover:border-amber-400/40 transition-all duration-150 cursor-pointer shadow-sm flex items-center gap-2 group text-left shrink-0'
    : 'w-9 h-9 rounded-full bg-slate-900/60 hover:bg-slate-800/80 backdrop-blur-md border border-white/10 hover:border-amber-400/40 transition active:scale-95 flex items-center justify-center cursor-pointer shrink-0';

  const buttonClasses = className ? `${baseClasses} ${className}` : baseClasses;

  return (
    <button
      type="button"
      id={elementId}
      onClick={handleClick}
      className={buttonClasses}
      title={elementTitle}
      aria-label={ariaLabel}
    >
      <PlayerAvatar
        avatarId={safeProfile?.avatarId}
        photoURL={safeProfile?.photoURL}
        size={avatarSize}
        title={safeCurrentTitle}
        showStatusDot={showStatusDot}
        isOnline={safeIsLoggedIn}
      />

      {shouldShowName && (
        <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors truncate max-w-[80px] sm:max-w-[110px] tracking-tight">
          {safeProfile?.displayName || 'Joueur'}
        </span>
      )}

      {shouldShowChevron && (
        <ChevronRight className="w-3 h-3 text-slate-400/80 group-hover:text-amber-300 transition-transform group-hover:translate-x-0.5 shrink-0" />
      )}
    </button>
  );
};
