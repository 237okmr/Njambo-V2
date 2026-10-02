import React, { useCallback, useEffect, useState } from 'react';
import { tikaFetch } from '../services/tikaFetch';

interface QuotaStatus {
  used: number;
  max: number;
  resetInMinutes: number;
}

interface KatikaAiQuotaGaugeProps {
  /** Change quand une réponse IA vient d'arriver : la jauge se rafraîchit. */
  refreshKey?: number | string;
}

/** Jauge « requêtes IA utilisées / plafond sur l'heure glissante », pour savoir avant de cliquer. */
export const KatikaAiQuotaGauge: React.FC<KatikaAiQuotaGaugeProps> = ({ refreshKey }) => {
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await tikaFetch('/api/katika/ai-quota');
      const data = await response.json();
      if (response.ok && data.success) {
        setStatus({ used: data.used, max: data.max, resetInMinutes: data.resetInMinutes });
      }
    } catch {
      // La jauge est un confort : en cas d'erreur réseau, elle reste simplement masquée.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!status) return null;

  const ratio = status.max > 0 ? status.used / status.max : 0;
  const tone = ratio >= 1 ? 'text-rose-300' : ratio >= 0.8 ? 'text-amber-300' : 'text-emerald-300';
  const title =
    status.used >= status.max
      ? `Quota atteint : prochain créneau dans ${status.resetInMinutes} min`
      : `${status.used} requête(s) IA sur ${status.max} cette heure`;

  return (
    <span className={`shrink-0 font-mono text-[11px] font-semibold ${tone}`} title={title}>
      IA {status.used}/{status.max}
      {status.used >= status.max && status.resetInMinutes > 0 ? ` · ${status.resetInMinutes} min` : ''}
    </span>
  );
};
