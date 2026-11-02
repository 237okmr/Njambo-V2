import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Smartphone } from 'lucide-react';
import { CashPhone, fetchKoraCashStatus, fetchPhones, fetchWithdrawalSettings } from '../../services/koraCashClient';
import { KoraCashPhonesPanel } from '../KoraCashWithdrawPanels';

interface MobileMoneySectionProps {
  isLoggedIn: boolean;
  onOpenKoraCash?: () => void;
}

/** Numéros Mobile Money du compte : présents quand Kora Cash est ouvert. Mêmes données et même bloc que dans Kora Cash. */
export const MobileMoneySection: React.FC<MobileMoneySectionProps> = ({ isLoggedIn, onOpenKoraCash }) => {
  const [isKoraCashEnabled, setIsKoraCashEnabled] = useState<boolean>(false);
  const [phones, setPhones] = useState<CashPhone[]>([]);
  const [maxPhones, setMaxPhones] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchKoraCashStatus().then((status) => {
      if (!cancelled) setIsKoraCashEnabled(status?.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isKoraCashEnabled || !isLoggedIn) return;
    let cancelled = false;
    Promise.all([fetchWithdrawalSettings(), fetchPhones()])
      .then(([settings, list]) => {
        if (cancelled) return;
        setMaxPhones(settings.maxPhones);
        setPhones(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Lecture de tes numéros impossible.');
      });
    return () => {
      cancelled = true;
    };
  }, [isKoraCashEnabled, isLoggedIn]);

  if (!isKoraCashEnabled) return null;

  return (
    <section id="settings-mobile-money" className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Smartphone className="w-3.5 h-3.5 text-amber-400" />
        Mobile Money
      </h3>

      {!isLoggedIn ? (
        <p className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-sm text-slate-300 leading-relaxed">
          Connecte-toi avec Google, juste au-dessus, pour enregistrer tes numéros et utiliser Kora Cash.
        </p>
      ) : error ? (
        <p className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-sm text-rose-300">{error}</p>
      ) : maxPhones === null ? (
        <div className="flex items-center justify-center gap-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Chargement…</span>
        </div>
      ) : (
        <KoraCashPhonesPanel phones={phones} maxPhones={maxPhones} onPhonesChange={setPhones} />
      )}

      {isLoggedIn && onOpenKoraCash && (
        <button
          type="button"
          id="btn-settings-open-kora-cash"
          onClick={onOpenKoraCash}
          className="w-full min-h-11 px-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-amber-300 font-bold text-sm flex items-center justify-between gap-2 transition cursor-pointer"
        >
          <span>Ouvrir mon portefeuille Kora Cash</span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      )}
    </section>
  );
};
