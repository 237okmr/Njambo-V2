import React, { useCallback, useState } from 'react';
import { Copy, Download, Loader2, RefreshCw, Share2, Sparkles, X } from 'lucide-react';
import type { KoraMoment } from '../../../../server/engine/koraMoment';
import { tikaFetch } from '../../services/tikaFetch';
import { renderSpecToDataUrl } from '../../visual/renderVisualSpec';
import { convertMemeToVisualSpec, drawRandomMeme } from '../../data/memeBank';
import {
  buildKoraDayPost,
  buildPodiumPost,
  buildPuzzlePost,
  getRecentQuickKeys,
  PodiumPlayer,
  QUICK_FORMATS,
  QuickFormat,
  QuickPost,
  rememberQuickKey,
} from '../../visual/quickPosts';
import { HONORIFIC_TITLES } from '../../../types/playerProfile';

interface KatikaQuickPostPanelProps {
  onClose: () => void;
  /** Demande 3 variantes à l'IA sur le même sujet (dans la discussion du copilote). */
  onAskAi: (brief: string, moment?: KoraMoment) => void;
}

async function loadMoments(): Promise<KoraMoment[]> {
  const res = await tikaFetch('/api/katika/moments');
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error || 'Moments Kora indisponibles.');
  return Array.isArray(body.moments) ? body.moments : [];
}

async function loadPodium(): Promise<PodiumPlayer[]> {
  const res = await fetch('/api/leaderboard/cached');
  const body = res.ok ? await res.json() : null;
  const users: any[] = Array.isArray(body?.users) ? body.users : [];
  return users
    .map((u) => ({
      name: String(u.displayName || '').trim(),
      score: Number(u.stats?.masteryScore ?? 0),
      title: HONORIFIC_TITLES.find((t) => t.id === u.dynamicRank?.titleId)?.title,
    }))
    .filter((p) => p.name)
    .sort((a, b) => b.score - a.score);
}

function memePost(): QuickPost {
  const meme = drawRandomMeme();
  return {
    format: 'MEME',
    key: `MEME:${meme.id}`,
    spec: convertMemeToVisualSpec(meme),
    caption: 'Ça t\'est déjà arrivé à la table ? Tag le pote qui fait toujours ça 😂\n#NjamboKora #JeuDeCartes',
    aiBrief: 'Crée un mème Njambo Kora drôle et bienveillant, avec un défi à un ami en question.',
  };
}

/**
 * Écran « Que veux-tu publier ? » : un visuel apparaît tout de suite, construit sur de vraies données et sans quota IA.
 * L'IA ne sert qu'à proposer des variantes, sur demande.
 */
export const KatikaQuickPostPanel: React.FC<KatikaQuickPostPanelProps> = ({ onClose, onAskAi }) => {
  const [format, setFormat] = useState<QuickFormat | null>(null);
  const [post, setPost] = useState<QuickPost | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const build = useCallback(async (chosen: QuickFormat) => {
    setFormat(chosen);
    setLoading(true);
    setMessage('');
    setPost(null);
    setImage(null);
    try {
      const recent = getRecentQuickKeys();
      let next: QuickPost | null = null;
      if (chosen === 'MEME') next = memePost();
      else if (chosen === 'PODIUM') next = buildPodiumPost(await loadPodium(), recent, new Date().toISOString().slice(0, 10));
      else {
        const moments = await loadMoments();
        next = chosen === 'PUZZLE' ? buildPuzzlePost(moments, recent) : buildKoraDayPost(moments, recent);
      }
      if (!next) {
        setMessage(
          chosen === 'PODIUM'
            ? 'Le Palmarès est vide pour le moment.'
            : 'Aucun vrai Kora enregistré pour le moment : il en faut un pour ce format.'
        );
        return;
      }
      rememberQuickKey(next.key);
      setPost(next);
      setCaption(next.caption);
      setImage(await renderSpecToDataUrl(next.spec));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Visuel impossible pour le moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fileName = `njambo_${(format || 'visuel').toLowerCase()}.png`;

  const share = async () => {
    if (!image) return;
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: caption });
        return;
      } catch {
        return; // partage annulé
      }
    }
    download();
    await copyCaption();
    setMessage('Image téléchargée et texte copié : colle-les dans WhatsApp ou ton réseau.');
  };

  const download = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = fileName;
    link.click();
  };

  const copyCaption = async (text = caption) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Texte copié.');
    } catch {
      setMessage('Copie impossible : sélectionne le texte à la main.');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/95 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="katika-quick-post-title">
      <div className="max-w-lg mx-auto p-4 pb-10 flex flex-col gap-4 text-slate-100">
        <div className="flex items-center justify-between">
          <h2 id="katika-quick-post-title" className="text-lg font-bold">Que veux-tu publier ?</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {QUICK_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => void build(f.id)}
              className={`min-h-[52px] rounded-xl border text-sm font-semibold ${
                format === f.id ? 'border-amber-500 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-200'
              }`}
            >
              {f.emoji} {f.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Préparation du visuel…
          </div>
        )}

        {image && post && (
          <>
            <img src={image} alt="Aperçu du visuel" className="w-full rounded-xl border border-slate-800" />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-400">Texte du post (modifiable)</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="rounded-xl bg-slate-900 border border-slate-700 p-3 text-base text-white outline-none focus:border-amber-500"
              />
            </label>

            {post.answer && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-sm flex flex-col gap-2">
                <span className="text-slate-400">Réponse à publier demain :</span>
                <span>{post.answer}</span>
                <button type="button" onClick={() => void copyCaption(post.answer)} className="self-start min-h-[44px] px-3 rounded-xl bg-slate-800 text-sm flex items-center gap-2">
                  <Copy className="w-4 h-4" /> Copier la réponse
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void share()} className="col-span-2 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2">
                <Share2 className="w-5 h-5" /> Partager (WhatsApp…)
              </button>
              <button type="button" onClick={download} className="min-h-[48px] rounded-xl bg-slate-800 text-sm flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Télécharger
              </button>
              <button type="button" onClick={() => void copyCaption()} className="min-h-[48px] rounded-xl bg-slate-800 text-sm flex items-center justify-center gap-2">
                <Copy className="w-4 h-4" /> Copier le texte
              </button>
              <button type="button" onClick={() => format && void build(format)} className="min-h-[48px] rounded-xl bg-slate-800 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Autre proposition
              </button>
              <button
                type="button"
                onClick={() => {
                  onAskAi(post.aiBrief, post.moment);
                  onClose();
                }}
                className="min-h-[48px] rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> 3 variantes IA
              </button>
            </div>
          </>
        )}

        {message && <p className="text-sm text-slate-300" role="status">{message}</p>}
        {!format && <p className="text-sm text-slate-400">Choisis un format : le visuel apparaît tout de suite, avec de vraies données et sans utiliser le quota de l'IA.</p>}
      </div>
    </div>
  );
};
