import React, { useState } from 'react';
import { AvatarOptionId, AVATAR_OPTIONS, HonorificTitle } from '../../types/playerProfile';
import { FlatAvatarIcon } from './FlatAvatarIcon';

interface PlayerAvatarProps {
  avatarId?: AvatarOptionId;
  photoURL?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  title?: HonorificTitle;
  showTitleBadge?: boolean;
  showStatusDot?: boolean;
  isOnline?: boolean;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  avatarId = 'lion',
  photoURL,
  size = 'md',
  title,
  showTitleBadge = false,
  showStatusDot = false,
  isOnline = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const isGoogle = avatarId === 'google' && !!photoURL && !imgError;
  const avatarConfig = AVATAR_OPTIONS.find((a) => a.id === avatarId) || AVATAR_OPTIONS[0];

  const sizeClasses = {
    xs: 'w-[26px] h-[26px]',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  const paddingClasses = {
    xs: 'p-0.5',
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
    xl: 'p-2.5',
  }[size];

  const badgeSizeClasses = {
    xs: 'w-3 h-3 text-[7px] -bottom-0.5 -right-0.5',
    sm: 'w-3.5 h-3.5 text-[8px] -bottom-0.5 -right-0.5',
    md: 'w-4 h-4 text-[10px] -bottom-0.5 -right-0.5',
    lg: 'w-5 h-5 text-xs -bottom-1 -right-1',
    xl: 'w-7 h-7 text-base -bottom-1 -right-1',
  }[size];

  const borderClass = size === 'xs' ? 'border-[1.5px]' : 'border-2';

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      <div
        className={`${sizeClasses} rounded-full bg-white flex items-center justify-center select-none overflow-hidden transition-all duration-200 shadow-sm ${
          isGoogle
            ? `${borderClass} border-amber-400`
            : `${borderClass} ${avatarConfig.borderClass || 'border-slate-300'}`
        }`}
      >
        {isGoogle ? (
          <img
            src={photoURL!}
            alt="Avatar"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${paddingClasses}`}>
            <FlatAvatarIcon avatarId={avatarId} />
          </div>
        )}
      </div>

      {showTitleBadge && title && !showStatusDot && (
        <span
          title={title.title}
          className={`absolute ${badgeSizeClasses} rounded-full bg-slate-900 border border-amber-400/60 flex items-center justify-center shadow-xs select-none`}
        >
          {title.badge}
        </span>
      )}

      {showStatusDot && (
        <span
          title={isOnline ? 'Synchronisé Google (Cloud)' : 'Mode Invité (Local)'}
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
            isOnline
              ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]'
              : 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.6)]'
          }`}
        />
      )}
    </div>
  );
};
