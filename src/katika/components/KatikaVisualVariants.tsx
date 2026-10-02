import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import { validateAndRepairSpec } from '../visual/validateSpec';
import { downloadSpecPng, renderSpecToDataUrl } from '../visual/renderVisualSpec';
import type { VisualVariantItem } from '../visual/variantsPayload';
import type { VisualSpec } from '../visual/visualSpec';

type CaptionPlatform = 'FACEBOOK' | 'GROUP' | 'STATUS';

const PLATFORM_LABELS: Record<CaptionPlatform, string> = {
  FACEBOOK: 'Facebook',
  GROUP: 'Groupe',
  STATUS: 'Statut',
};

const ANGLE_LABELS: Record<string, string> = {
  HUMOUR: 'Humour',
  DEFI: 'Défi',
  CLAIR: 'Clair',
};

function captionFor(spec: VisualSpec, platform: CaptionPlatform): string {
  const captions = spec.captions;
  if (!captions) return '';
  if (platform === 'FACEBOOK') return captions.facebook || '';
  if (platform === 'GROUP') return captions.whatsappGroup || '';
  return captions.whatsappStatus || '';
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, base64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Partage l'image (avec le texte) quand le téléphone le permet ; sinon télécharge l'image. */
async function shareVariant(spec: VisualSpec, text: string): Promise<'shared' | 'fallback' | 'cancelled'> {
  const dataUrl = await renderSpecToDataUrl(spec);
  const file = new File([dataUrlToBlob(dataUrl)], 'njambo-kora.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }

  await downloadSpecPng(spec);
  return 'fallback';
}

interface KatikaVisualVariantsProps {
  variants: VisualVariantItem[];
  /** Ouvre l'éditeur complet (bureau uniquement). */
  onEdit?: () => void;
}

/** Variantes de visuel : une visible à la fois (balayage horizontal), avec une barre d'actions fixe dessous. */
export const KatikaVisualVariants: React.FC<KatikaVisualVariantsProps> = ({ variants, onEdit }) => {
  // Les légendes sont recalculées ici avec les liens réglés dans le copilote de l'admin.
  const specs = useMemo(
    () => variants.map((v) => validateAndRepairSpec(v.spec).spec ?? v.spec),
    [variants]
  );

  const [index, setIndex] = useState(0);
  const [platform, setPlatform] = useState<CaptionPlatform>('FACEBOOK');
  const [images, setImages] = useState<Record<number, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < specs.length; i++) {
        try {
          const url = await renderSpecToDataUrl(specs[i]);
          if (cancelled) return;
          setImages((prev) => ({ ...prev, [i]: url }));
        } catch {
          // Un visuel qui ne se dessine pas n'empêche pas les autres.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [specs]);

  useEffect(() => {
    setNotice(null);
  }, [index, platform]);

  const currentSpec = specs[Math.min(index, specs.length - 1)];
  const currentCaption = captionFor(currentSpec, platform);
  const currentKey = `${index}-${platform}`;
  const needsReview = Boolean(variants[index]?.needsReview || currentSpec.meta?.needsReview);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIndex(i);
  };

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i < specs.length) setIndex(i);
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text.trim());
      return true;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(currentCaption);
    setCopiedKey(ok ? currentKey : null);
    setNotice(ok ? null : 'Copie impossible sur cet appareil : appuie longuement sur le texte pour le copier.');
  };

  const handleDownload = async () => {
    try {
      await downloadSpecPng(currentSpec);
    } catch {
      setNotice("Le téléchargement de l'image a échoué. Réessaie.");
    }
  };

  const handleShare = async () => {
    // Le texte est aussi copié : certaines applications ignorent le texte quand une image est partagée.
    const copied = await copyToClipboard(currentCaption);
    if (copied) setCopiedKey(currentKey);
    try {
      const result = await shareVariant(currentSpec, currentCaption);
      if (result === 'fallback') {
        setNotice(copied ? "Image téléchargée et texte copié : colle-les dans l'application." : 'Image téléchargée.');
      }
    } catch {
      setNotice('Le partage a échoué. Utilise Télécharger puis Copier le post.');
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3 select-text">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-300">
            {ANGLE_LABELS[variants[index]?.angle || ''] || 'Visuel'} · {index + 1}/{specs.length}
          </span>
          {needsReview && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300">
              <AlertTriangle className="h-3 w-3" />
              À relire
            </span>
          )}
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs font-semibold text-slate-200"
          >
            <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
            Modifier
          </button>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none]"
      >
        {specs.map((spec, i) => (
          <div key={i} className="w-full shrink-0 snap-center">
            {images[i] ? (
              <img src={images[i]} alt={`Variante ${i + 1}`} className="w-full rounded-xl border border-slate-800" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-400">
                Préparation du visuel…
              </div>
            )}
          </div>
        ))}
      </div>

      {specs.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {specs.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Voir la variante ${i + 1}`}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span className={`h-2.5 w-2.5 rounded-full ${i === index ? 'bg-amber-400' : 'bg-slate-600'}`} />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-950 p-1">
        {(Object.keys(PLATFORM_LABELS) as CaptionPlatform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={`min-h-[44px] rounded-lg text-[13px] font-semibold ${
              platform === p ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-3 text-[14px] leading-relaxed text-slate-200">
        {currentCaption || 'Aucun texte de post pour cette variante.'}
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-slate-950 active:bg-amber-400"
      >
        {copiedKey === currentKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copiedKey === currentKey ? 'Post copié' : 'Copier le post'}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-200"
        >
          <Download className="h-4 w-4 text-amber-400" />
          Télécharger
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-200"
        >
          <Share2 className="h-4 w-4 text-amber-400" />
          Partager
        </button>
      </div>

      {notice && <p className="text-xs leading-relaxed text-amber-300">{notice}</p>}
    </div>
  );
};
