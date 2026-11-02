import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Home, Trophy, User as UserIcon, Wallet } from 'lucide-react';
import { fetchKoraCashStatus } from '../../services/koraCashClient';
import { triggerHaptic } from '../../utils/sound';
import { BottomNavItem } from '../../utils/bottomNav';

interface BottomNavBarProps {
  isVisible: boolean;
  activeItem: BottomNavItem;
  onNavigate: (item: BottomNavItem) => void;
}

const isTextField = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
  if (target.tagName !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit'].includes((target as HTMLInputElement).type);
};

/** Vrai quand un champ de saisie a le focus sur écran tactile : le clavier est ouvert, la barre lui laisse la place. */
function useIsKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const onFocusIn = (e: FocusEvent) => setIsOpen(isTextField(e.target));
    const onFocusOut = () => setIsOpen(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return isOpen;
}

/** Barre principale, sous le pouce. Les écrans lui réservent sa hauteur par la variable CSS --app-bottom-nav. */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ isVisible, activeItem, onNavigate }) => {
  const isKeyboardOpen = useIsKeyboardOpen();
  const [isKoraCashEnabled, setIsKoraCashEnabled] = useState<boolean>(false);
  const shown = isVisible && !isKeyboardOpen;

  useEffect(() => {
    let cancelled = false;
    fetchKoraCashStatus().then((status) => {
      if (!cancelled) setIsKoraCashEnabled(status?.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('has-bottom-nav', shown);
    return () => document.documentElement.classList.remove('has-bottom-nav');
  }, [shown]);

  if (!shown) return null;

  const items: { id: BottomNavItem; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'Accueil', icon: Home },
    ...(isKoraCashEnabled ? [{ id: 'koraCash' as const, label: 'Kora Cash', icon: Wallet }] : []),
    { id: 'leaderboard', label: 'Palmarès', icon: Trophy },
    { id: 'profile', label: 'Profil', icon: UserIcon },
  ];

  return (
    <nav
      id="app-bottom-nav"
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-[55] bg-slate-900/95 backdrop-blur-md border-t border-slate-800 select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-md mx-auto h-14 flex items-stretch">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = activeItem === id;
          return (
            <button
              key={id}
              type="button"
              id={`bottom-nav-${id}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                triggerHaptic('light');
                onNavigate(id);
              }}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-xs font-bold transition cursor-pointer active:scale-95 ${
                isActive ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
