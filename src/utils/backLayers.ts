/**
 * Fenêtres ouvertes à l'intérieur d'un écran : le bouton Retour les ferme une par une, de la plus récente à
 * la plus ancienne, avant de fermer l'écran lui-même (voir le gestionnaire unique dans App.tsx).
 */
type BackLayer = () => void;

let layers: BackLayer[] = [];

export function pushBackLayer(onBack: BackLayer): () => void {
  layers.push(onBack);
  return () => {
    layers = layers.filter((layer) => layer !== onBack);
  };
}

/** Ferme la fenêtre la plus récente. Renvoie faux s'il n'y en a aucune. */
export function consumeBackLayer(): boolean {
  const top = layers[layers.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function clearBackLayers(): void {
  layers = [];
}
