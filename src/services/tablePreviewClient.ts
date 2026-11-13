/** Carte d'arrivée d'un lien de table gratuite (lecture seule, plafonnée côté serveur). */
export interface FreeTablePreview {
  state: 'OPEN' | 'FULL' | 'STARTED' | 'UNAVAILABLE';
  hostName?: string;
  seated?: number;
  capacity?: number;
}

export async function fetchTablePreview(code: string): Promise<FreeTablePreview> {
  try {
    const res = await fetch(`/api/table-preview/${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!res.ok) return { state: 'UNAVAILABLE' };
    const data = await res.json();
    const state = data?.state;
    if (state !== 'OPEN' && state !== 'FULL' && state !== 'STARTED') return { state: 'UNAVAILABLE' };
    return {
      state,
      hostName: typeof data.hostName === 'string' ? data.hostName : undefined,
      seated: typeof data.seated === 'number' ? data.seated : undefined,
      capacity: typeof data.capacity === 'number' ? data.capacity : undefined,
    };
  } catch {
    return { state: 'UNAVAILABLE' };
  }
}
