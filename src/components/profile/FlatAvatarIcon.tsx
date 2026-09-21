import React from 'react';

interface FlatAvatarIconProps {
  avatarId?: string;
  className?: string;
}

export const FlatAvatarIcon: React.FC<FlatAvatarIconProps> = ({
  avatarId = 'lion',
  className = 'w-full h-full',
}) => {
  const normalizedId = (avatarId || 'lion').toLowerCase();

  switch (normalizedId) {
    case 'lion':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Crown */}
          <path d="M38 18L43 28L50 16L57 28L62 18L65 32H35L38 18Z" fill="#F59E0B" />
          <circle cx="50" cy="16" r="3" fill="#EF4444" />
          <circle cx="38" cy="18" r="2.5" fill="#3B82F6" />
          <circle cx="62" cy="18" r="2.5" fill="#3B82F6" />
          {/* Lion Mane (Flat orange/amber multi-shape) */}
          <path d="M50 24C28 24 22 42 22 60C22 76 34 88 50 88C66 88 78 76 78 60C78 42 72 24 50 24Z" fill="#EA580C" />
          <path d="M50 28C32 28 26 44 26 60C26 73 36 84 50 84C64 84 74 73 74 60C74 44 68 28 50 28Z" fill="#F59E0B" />
          {/* Face */}
          <circle cx="50" cy="58" r="22" fill="#FBBF24" />
          {/* Ears */}
          <circle cx="33" cy="42" r="7" fill="#FBBF24" />
          <circle cx="33" cy="42" r="4" fill="#F87171" />
          <circle cx="67" cy="42" r="7" fill="#FBBF24" />
          <circle cx="67" cy="42" r="4" fill="#F87171" />
          {/* Muzzle */}
          <ellipse cx="50" cy="64" rx="10" ry="7" fill="#FEF3C7" />
          {/* Nose */}
          <path d="M45 59C45 59 47.5 63 50 63C52.5 63 55 59 55 59H45Z" fill="#1E293B" />
          {/* Eyes */}
          <ellipse cx="41" cy="52" rx="3" ry="4" fill="#1E293B" />
          <ellipse cx="59" cy="52" rx="3" ry="4" fill="#1E293B" />
          <circle cx="42" cy="51" r="1.2" fill="#FFFFFF" />
          <circle cx="60" cy="51" r="1.2" fill="#FFFFFF" />
          {/* Mouth */}
          <path d="M50 63V67M46 66C47.5 67.5 49 68 50 68C51 68 52.5 67.5 54 66" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'cheetah':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Head base */}
          <ellipse cx="50" cy="52" rx="32" ry="30" fill="#F97316" />
          {/* Ears */}
          <path d="M22 30C16 18 28 14 34 24Z" fill="#EA580C" />
          <path d="M24 28C20 20 27 17 31 24Z" fill="#FED7AA" />
          <path d="M78 30C84 18 72 14 66 24Z" fill="#EA580C" />
          <path d="M76 28C80 20 73 17 69 24Z" fill="#FED7AA" />
          {/* Muzzle */}
          <ellipse cx="50" cy="62" rx="14" ry="11" fill="#FFF7ED" />
          {/* Spots */}
          <circle cx="32" cy="38" r="3" fill="#1E293B" />
          <circle cx="68" cy="38" r="3" fill="#1E293B" />
          <circle cx="26" cy="50" r="3.5" fill="#1E293B" />
          <circle cx="74" cy="50" r="3.5" fill="#1E293B" />
          <circle cx="36" cy="28" r="2.5" fill="#1E293B" />
          <circle cx="64" cy="28" r="2.5" fill="#1E293B" />
          <circle cx="50" cy="28" r="3" fill="#1E293B" />
          {/* Tear marks */}
          <path d="M40 52C39 58 39 64 42 67" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
          <path d="M60 52C61 58 61 64 58 67" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
          {/* Eyes */}
          <ellipse cx="38" cy="48" rx="4" ry="5" fill="#1E293B" />
          <ellipse cx="62" cy="48" rx="4" ry="5" fill="#1E293B" />
          <circle cx="39" cy="46" r="1.5" fill="#FFFFFF" />
          <circle cx="63" cy="46" r="1.5" fill="#FFFFFF" />
          {/* Nose */}
          <path d="M44 58H56L50 63Z" fill="#F43F5E" />
        </svg>
      );

    case 'eagle':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Background circle accent */}
          <circle cx="50" cy="50" r="42" fill="#E0F2FE" />
          {/* Eagle Body / Shoulders */}
          <path d="M18 80C18 64 32 58 50 58C68 58 82 64 82 80V86H18V80Z" fill="#0284C7" />
          {/* Eagle Head (White feathers) */}
          <path d="M50 18C34 18 28 32 28 50C28 62 38 68 50 68C62 68 72 62 72 50C72 32 66 18 50 18Z" fill="#38BDF8" />
          <path d="M50 22C36 22 31 34 31 50C31 60 40 65 50 65C60 65 69 60 69 50C69 34 64 22 50 22Z" fill="#F8FAFC" />
          {/* Beak */}
          <path d="M50 44L76 50C78 51 76 58 70 60L50 58V44Z" fill="#F59E0B" />
          <path d="M50 48L72 52L50 56V48Z" fill="#D97706" />
          {/* Eye */}
          <circle cx="44" cy="42" r="5" fill="#F59E0B" />
          <circle cx="44" cy="42" r="3" fill="#0F172A" />
          <circle cx="45" cy="41" r="1" fill="#FFFFFF" />
          {/* Brow line */}
          <path d="M36 37C42 36 48 39 52 41" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'ace':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Card 1 (Back/Left - Red Heart Ace) */}
          <g transform="translate(18, 14) rotate(-12)">
            <rect x="0" y="0" width="44" height="62" rx="6" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
            <path d="M22 24C22 24 14 16 10 22C6 28 14 34 22 42C30 34 38 28 34 22C30 16 22 24 22 24Z" fill="#EF4444" />
            <text x="5" y="14" fill="#EF4444" fontSize="11" fontWeight="900" fontFamily="sans-serif">A</text>
          </g>
          {/* Card 2 (Front/Right - Black Spade Ace) */}
          <g transform="translate(38, 20) rotate(8)">
            <rect x="0" y="0" width="44" height="62" rx="6" fill="#FFFFFF" stroke="#64748B" strokeWidth="2.5" />
            <path d="M22 18C22 18 10 30 10 35C10 40 15 42 19 40C20 44 19 48 17 50H27C25 48 24 44 25 40C29 42 34 40 34 35C34 30 22 18 22 18Z" fill="#0F172A" />
            <text x="5" y="14" fill="#0F172A" fontSize="11" fontWeight="900" fontFamily="sans-serif">A</text>
          </g>
        </svg>
      );

    case 'diamond':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Diamond Facets */}
          <path d="M50 16L78 36L50 84L22 36L50 16Z" fill="#06B6D4" />
          {/* Top Crown Facets */}
          <path d="M50 16L35 36H65L50 16Z" fill="#67E8F9" />
          <path d="M22 36L35 36L50 16L22 36Z" fill="#22D3EE" />
          <path d="M78 36L65 36L50 16L78 36Z" fill="#0891B2" />
          {/* Bottom Pavilion Facets */}
          <path d="M35 36L50 84L50 36H35Z" fill="#0284C7" />
          <path d="M65 36L50 84L50 36H65Z" fill="#0369A1" />
          <path d="M22 36L50 84L35 36H22Z" fill="#0E7490" />
          <path d="M78 36L50 84L65 36H78Z" fill="#155E75" />
          {/* Sparkles */}
          <path d="M76 20L78 24L82 26L78 28L76 32L74 28L70 26L74 24L76 20Z" fill="#A5F3FC" />
          <path d="M24 64L25 67L28 68L25 69L24 72L23 69L20 68L23 67L24 64Z" fill="#A5F3FC" />
        </svg>
      );

    case 'shield':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Main Shield Outer */}
          <path d="M50 16C68 16 80 20 80 34C80 62 62 78 50 86C38 78 20 62 20 34C20 20 32 16 50 16Z" fill="#6B21A8" stroke="#F59E0B" strokeWidth="3" />
          {/* Inner Shield */}
          <path d="M50 22C64 22 74 25 74 36C74 58 59 72 50 78C41 72 26 58 26 36C26 25 36 22 50 22Z" fill="#9333EA" />
          {/* Gold Emblem Cross/Star */}
          <path d="M50 28V68M30 46H70" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" />
          <circle cx="50" cy="46" r="10" fill="#F59E0B" />
          <circle cx="50" cy="46" r="5" fill="#FEF08A" />
        </svg>
      );

    case 'lightning':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Background circle accent */}
          <circle cx="50" cy="50" r="38" fill="#FEF08A" />
          {/* Main Lightning Bolt */}
          <path d="M54 14L24 52H48L42 86L76 44H52L54 14Z" fill="#F59E0B" stroke="#D97706" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Front Highlight */}
          <path d="M54 14L32 50H50L44 80L70 46H50L54 14Z" fill="#FACC15" />
        </svg>
      );

    case 'star':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          {/* Main Star */}
          <path d="M50 14L61.8 38H87.3L66.7 53L74.5 77L50 62L25.5 77L33.3 53L12.7 38H38.2L50 14Z" fill="#F59E0B" />
          {/* Shaded Half for 3D Flat Depth */}
          <path d="M50 14V62L74.5 77L66.7 53L87.3 38H61.8L50 14Z" fill="#D97706" />
          <path d="M50 22L58.2 38.8H76.2L61.7 49.3L67.2 66.2L50 55.6Z" fill="#FBBF24" />
          {/* Center Sparkle */}
          <circle cx="50" cy="44" r="5" fill="#FEF08A" />
        </svg>
      );

    default:
      // Generic flat user / bot icon fallback
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="50" cy="50" r="42" fill="#F1F5F9" />
          <circle cx="50" cy="40" r="18" fill="#3B82F6" />
          <path d="M22 78C22 64 34 58 50 58C66 58 78 64 78 78V84H22V78Z" fill="#1D4ED8" />
        </svg>
      );
  }
};
