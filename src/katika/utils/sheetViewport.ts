/** Mesures de la zone réellement visible de l'écran (clavier exclu), telles que les donne window.visualViewport. */
export interface ViewportBoxInput {
  height: number;
  offsetTop: number;
}

export interface SheetBox {
  top: number;
  height: number;
}

/**
 * Zone dans laquelle le volet de katika s'affiche. Sur téléphone, quand le clavier s'ouvre, la zone visible se réduit :
 * le volet s'y cale pour que ses boutons restent au-dessus du clavier. Renvoie null (pas de réglage, le volet occupe
 * tout l'écran) si la mesure est absente ou inutilisable.
 */
export function computeSheetBox(viewport: ViewportBoxInput | null | undefined): SheetBox | null {
  if (!viewport) return null;
  const { height, offsetTop } = viewport;
  if (!Number.isFinite(height) || !Number.isFinite(offsetTop) || height <= 0) return null;
  return { top: Math.max(0, Math.round(offsetTop)), height: Math.round(height) };
}
