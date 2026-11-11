import { useEffect, useState } from 'react';
import { getPublicParam, subscribePublicConfig } from '../services/publicConfig';
import { fetchKoraCashStatus } from '../services/koraCashClient';

export interface SocialFlags {
  /** Interrupteur katika « Centre social ». */
  centerEnabled: boolean;
  /** Interrupteur katika « Côté Kora Cash du centre social ». */
  cashSideEnabled: boolean;
}

function readFlags(): SocialFlags {
  return {
    centerEnabled: getPublicParam('socialCenterEnabled') === true,
    cashSideEnabled: getPublicParam('socialCashEnabled') === true,
  };
}

/** Interrupteurs katika du centre social, à jour dès que la configuration publique change. */
export function useSocialFlags(): SocialFlags {
  const [flags, setFlags] = useState<SocialFlags>(readFlags);
  useEffect(() => {
    const refresh = () => {
      const next = readFlags();
      setFlags((prev) => (prev.centerEnabled === next.centerEnabled && prev.cashSideEnabled === next.cashSideEnabled ? prev : next));
    };
    refresh();
    return subscribePublicConfig(refresh);
  }, []);
  return flags;
}

/** Kora Cash est-il ouvert ? Lu une fois au montage, comme la barre du bas. Faux tant que la réponse n'est pas là. */
export function useKoraCashEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    fetchKoraCashStatus().then((status) => {
      if (!cancelled) setEnabled(status?.enabled === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
