import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Edit2,
  Smartphone,
  Download,
  Check,
  AlertTriangle,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Type,
  LayoutGrid,
  Palette,
  X,
  FileText,
  Copy,
  BookOpen,
  Bookmark,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  VisualSpec,
  VisualBlock,
  VisualBlockType,
  BLOCK_DEFS,
  HookBlock,
  BodyBlock,
  BulletsBlock,
  StatBlock,
  QuoteBlock,
  CompareBlock,
  CardsBlock,
  StepsBlock,
  EventBlock,
  ImageBlock,
} from '../../visual/visualSpec';
import { SocialVisualFormat, SocialVisualPalette, SocialVisualPattern } from '../../types/socialVisuals';
import { renderVisualSpecToCanvas, downloadSpecPng } from '../../visual/renderVisualSpec';
import { computeLayout } from '../../visual/layoutEngine';
import { PRESET_DEFS, getPresetDef, PresetDef } from '../../visual/presets';
import { listRecipes, saveRecipe, deleteRecipe, SavedRecipe } from '../../visual/recipes';
import { buildCaptions, BuiltCaptions } from '../../visual/captionEngine';
import {
  drawRandomMeme,
  convertMemeToVisualSpec,
  saveMemeStatus,
  getMemeStatuses,
  MemeEntry,
} from '../../data/memeBank';
import { tikaFetch } from '../../services/tikaFetch';

interface KatikaVisualComposerProps {
  initialSpec?: VisualSpec;
  onClose?: () => void;
}

const DEFAULT_BLANK_SPEC: VisualSpec = {
  version: 2,
  format: 'SQUARE',
  palette: 'EMERALD_GOLD',
  pattern: 'NDOP_CHEVRON',
  blocks: [
    {
      id: 'block-badge-init',
      type: 'BADGE',
      text: 'NJAMBO KORA',
      priority: 1,
    },
    {
      id: 'block-hook-init',
      type: 'HOOK',
      text: 'LE JEU DU TAPIS VERT',
      accentWords: ['TAPIS', 'VERT'],
      priority: 1,
    },
    {
      id: 'block-body-init',
      type: 'BODY',
      text: 'Affronte tes amis en ligne et réalise des Koras légendaires.',
      priority: 2,
    },
  ],
  cta: { text: 'Viens tester la bêta' },
  footer: { text: 'njambo-kora.ai.studio', whatsapp: true, app: true },
};

export const KatikaVisualComposer: React.FC<KatikaVisualComposerProps> = ({
  initialSpec,
  onClose,
}) => {
  const [spec, setSpec] = useState<VisualSpec>(() => initialSpec || DEFAULT_BLANK_SPEC);
  const [activeTab, setActiveTab] = useState<'PRESETS' | 'EDITOR' | 'CAPTIONS'>('PRESETS');

  // Recettes prédéfinies & Formulaire dynamique
  const [selectedPresetId, setSelectedPresetId] = useState<string>('UPDATE_ANNOUNCEMENT');
  const [presetFormValues, setPresetFormValues] = useState<Record<string, any>>({});

  // Recettes sauvegardées
  const [myRecipes, setMyRecipes] = useState<SavedRecipe[]>([]);
  const [newRecipeName, setNewRecipeName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);

  // Génération par IA
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiBrief, setAiBrief] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Mème du jour
  const [currentMeme, setCurrentMeme] = useState<MemeEntry | null>(null);
  const [memeStatus, setMemeStatus] = useState<'A_RELIRE' | 'VALIDE'>('A_RELIRE');

  const handleDrawMemeDay = () => {
    const meme = drawRandomMeme();
    setCurrentMeme(meme);
    const statuses = getMemeStatuses();
    const status = statuses[meme.id] || meme.status || 'A_RELIRE';
    setMemeStatus(status);
    const newSpec = convertMemeToVisualSpec(meme);
    setSpec(newSpec);
    setActiveTab('EDITOR');
  };

  const handleToggleValidateCurrentMeme = () => {
    if (!currentMeme) return;
    const newStatus = memeStatus === 'VALIDE' ? 'A_RELIRE' : 'VALIDE';
    saveMemeStatus(currentMeme.id, newStatus);
    setMemeStatus(newStatus);
    setCurrentMeme({ ...currentMeme, status: newStatus });
  };

  const handleRewriteMemeWithAi = async () => {
    if (!currentMeme) return;
    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const brief = `Réécrire ce mème Katika de façon percutante: "${currentMeme.setup}" - "${currentMeme.punchline}"`;
      const res = await tikaFetch('/api/katika/ai-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          format: spec.format,
          palette: spec.palette,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Échec de réécriture IA');
      }

      setSpec(data.spec);
      setActiveTab('EDITOR');
    } catch (err: unknown) {
      console.error('[Meme AI Rewrite] Error:', err);
      setAiError(err instanceof Error ? err.message : 'Erreur de réécriture IA.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Légendes générées & éditables
  const [captions, setCaptions] = useState<BuiltCaptions>({
    facebook: '',
    whatsappGroup: '',
    whatsappStatus: '',
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Contrôles aperçu canvas
  const [isPhonePreview, setIsPhonePreview] = useState<boolean>(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const [layoutWarnings, setLayoutWarnings] = useState<string[]>([]);
  const [downloading, setDownloading] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Charger les recettes personnelles au démarrage
  useEffect(() => {
    setMyRecipes(listRecipes());
  }, []);

  // Initialiser le formulaire du preset lors du changement de preset
  useEffect(() => {
    const p = getPresetDef(selectedPresetId);
    if (p) {
      const initVals: Record<string, any> = {};
      p.inputs.forEach((inp) => {
        initVals[inp.id] = inp.defaultValue;
      });
      setPresetFormValues(initVals);
    }
  }, [selectedPresetId]);

  // Régénérer automatiquement les légendes lorsque le spec change
  useEffect(() => {
    const generated = buildCaptions(spec);
    setCaptions(generated);
  }, [spec]);

  // Rendu Canvas en direct et calcul des avertissements
  useEffect(() => {
    if (canvasRef.current) {
      renderVisualSpecToCanvas(canvasRef.current, spec);

      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const layout = computeLayout(spec, (text, fontPx, weight) => {
          ctx.font = `${weight === 'bold' ? 'bold ' : ''}${fontPx}px Anton, Impact, system-ui, sans-serif`;
          return ctx.measureText(text).width;
        });

        const warnings: string[] = [...layout.warnings];
        if (layout.removedBlocks.length > 0) {
          warnings.push(
            `Blocs masqués pour éviter tout débordement: ${layout.removedBlocks
              .map((b) => b.type)
              .join(', ')}`
          );
        }
        setLayoutWarnings(warnings);
      }
    }
  }, [spec]);

  // Générer le spec à partir d'un preset
  const handleGenerateFromPreset = () => {
    const p = getPresetDef(selectedPresetId);
    if (!p) return;
    const generatedSpec = p.build(presetFormValues, {
      snapshot: { koraCount: 142, playerCount: 580, weeklyGames: 1250 },
    });
    setSpec(generatedSpec);
    setActiveTab('EDITOR');
  };

  // Charger une recette personnelle
  const handleSelectRecipe = (recipe: SavedRecipe) => {
    setSpec(recipe.spec);
    setActiveTab('EDITOR');
  };

  // Sauvegarder la recette courante
  const handleSaveCurrentRecipe = () => {
    if (!newRecipeName.trim()) return;
    saveRecipe(newRecipeName.trim(), spec);
    setMyRecipes(listRecipes());
    setNewRecipeName('');
    setShowSaveModal(false);
  };

  // Générer le visuel via l'API IA
  const handleGenerateWithAi = async () => {
    if (!aiBrief.trim()) return;
    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const res = await tikaFetch('/api/katika/ai-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: aiBrief.trim(),
          format: spec.format,
          palette: spec.palette,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Échec de génération IA');
      }

      setSpec(data.spec);
      setActiveTab('EDITOR');
      setShowAiModal(false);
      setAiBrief('');
    } catch (err: unknown) {
      console.error('[Composer AI] Error:', err);
      setAiError(err instanceof Error ? err.message : 'Erreur inconnue lors de la génération IA.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Supprimer une recette personnelle
  const handleDeleteRecipe = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteRecipe(id);
    setMyRecipes(listRecipes());
  };

  // Copie de légende dans le presse-papier
  const handleCopyCaption = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Erreur de copie dans le presse-papier', err);
    }
  };

  // Réorganisation des blocs
  const moveBlock = (index: number, direction: 'UP' | 'DOWN') => {
    const newIndex = direction === 'UP' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= spec.blocks.length) return;

    const updatedBlocks = [...spec.blocks];
    const [moved] = updatedBlocks.splice(index, 1);
    updatedBlocks.splice(newIndex, 0, moved);

    setSpec({ ...spec, blocks: updatedBlocks });
  };

  const deleteBlock = (id: string) => {
    setSpec({
      ...spec,
      blocks: spec.blocks.filter((b) => b.id !== id),
    });
    if (editingBlockId === id) setEditingBlockId(null);
  };

  const addBlock = (type: VisualBlockType) => {
    const newId = `block-${type.toLowerCase()}-${Date.now()}`;
    let newBlock: VisualBlock;

    switch (type) {
      case 'BADGE':
        newBlock = { id: newId, type: 'BADGE', text: 'NOUVEAU', priority: 1 };
        break;
      case 'HOOK':
        newBlock = {
          id: newId,
          type: 'HOOK',
          text: 'TITRE D ACCROCHE PERCUTANT',
          accentWords: ['ACCROCHE', 'PERCUTANT'],
          priority: 1,
        };
        break;
      case 'BODY':
        newBlock = {
          id: newId,
          type: 'BODY',
          text: 'Description détaillée du message à transmettre à la communauté.',
          priority: 2,
        };
        break;
      case 'BULLETS':
        newBlock = {
          id: newId,
          type: 'BULLETS',
          items: ['Première règle ou fonctionnalité', 'Deuxième point fort', 'Troisième avantage'],
          style: 'CHECK',
          priority: 2,
        };
        break;
      case 'STAT':
        newBlock = {
          id: newId,
          type: 'STAT',
          value: '100%',
          label: 'ACCÈS LIBRE EN BÊTA',
          sublabel: 'Accessible directement sur navigateur',
          priority: 1,
        };
        break;
      case 'QUOTE':
        newBlock = {
          id: newId,
          type: 'QUOTE',
          text: 'Le Njambo Kora est le roi incontesté des jeux de cartes.',
          author: 'Un Joueur Passionné',
          priority: 2,
        };
        break;
      case 'COMPARE':
        newBlock = {
          id: newId,
          type: 'COMPARE',
          leftTitle: 'AUTRES JEUX',
          leftText: 'Règles complexes et parties lentes',
          rightTitle: 'NJAMBO KORA',
          rightText: 'Stratégie rapide et ambiance conviviale',
          priority: 2,
        };
        break;
      case 'CARDS':
        newBlock = {
          id: newId,
          type: 'CARDS',
          arrangement: 'FAN',
          cards: [
            { rank: '3', suit: '♥', label: 'KORA', highlight: true },
            { rank: '10', suit: '♦', label: 'ZING' },
            { rank: '9', suit: '♠', label: 'BLACK' },
          ],
          priority: 2,
        };
        break;
      case 'STEPS':
        newBlock = {
          id: newId,
          type: 'STEPS',
          items: ['Ouvre le lien de la bêta', 'Choisis ton pseudo', 'Entre sur le tapis vert'],
          priority: 2,
        };
        break;
      case 'EVENT':
        newBlock = {
          id: newId,
          type: 'EVENT',
          date: 'Ce Soir à 20h',
          prize: '5 000 Jetons',
          mode: 'Multijoueur',
          spots: '16 Places',
          priority: 1,
        };
        break;
      case 'IMAGE':
        newBlock = {
          id: newId,
          type: 'IMAGE',
          dataUrl: '',
          frame: 'ROUNDED',
          priority: 2,
        };
        break;
      default:
        newBlock = { id: newId, type: 'BODY', text: 'Nouveau bloc', priority: 2 };
        break;
    }

    setSpec({ ...spec, blocks: [...spec.blocks, newBlock] });
    setEditingBlockId(newId);
    setShowAddMenu(false);
  };

  const updateBlock = (updated: VisualBlock) => {
    setSpec({
      ...spec,
      blocks: spec.blocks.map((b) => (b.id === updated.id ? updated : b)),
    });
  };

  // Import et optimisation d'image locale
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    block: ImageBlock
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1080;
        let w = img.width;
        let h = img.height;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          updateBlock({
            ...block,
            dataUrl: resizedDataUrl,
          });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSpecPng(spec, `katika-visuel-${spec.format.toLowerCase()}.png`);
    } catch (e) {
      console.error('Erreur téléchargement visuel V2:', e);
    } finally {
      setDownloading(false);
    }
  };

  const currentPreset = getPresetDef(selectedPresetId);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-3 md:p-5 bg-slate-900 text-slate-100 rounded-xl min-h-[600px]">
      {/* Colonne de Gauche : Menu, Recettes & Éditeur */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[85vh] pr-1">
        {/* Navigation entre Onglets */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('PRESETS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'PRESETS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Recettes Officieuses
            </button>
            <button
              onClick={() => setActiveTab('EDITOR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'EDITOR'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Éditeur de Blocs ({spec.blocks.length})
            </button>
            <button
              onClick={() => setActiveTab('CAPTIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'CAPTIONS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Légendes Réseaux
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDrawMemeDay}
              className="text-xs px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 transition shadow"
              title="Tirer un mème sans aucun coût en tokens"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Mème du jour
            </button>
            <button
              onClick={() => setShowAiModal(true)}
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg flex items-center gap-1 transition font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Générer avec l'IA
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg flex items-center gap-1 transition font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              Sauvegarder recette
            </button>
          </div>
        </div>

        {/* ONGLET 1 : RECETTES & FORMULAIRE */}
        {activeTab === 'PRESETS' && (
          <div className="space-y-5 animate-fadeIn">
            {/* 0. Section Mème du jour (Coût zéro token) */}
            <div className="bg-gradient-to-r from-amber-950/40 via-slate-800/80 to-slate-800/80 p-4 rounded-xl border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🃏</span>
                  <div>
                    <h3 className="text-sm font-bold text-amber-300">Mème du Jour (Génération instantanée • 0 Token)</h3>
                    <p className="text-[11px] text-slate-400">Tirez un mème créatif validé parmi la banque locale Katika</p>
                  </div>
                </div>
                {currentMeme && (
                  <div className="flex items-center gap-2">
                    {memeStatus === 'VALIDE' ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Validé
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        À relire
                      </span>
                    )}
                  </div>
                )}
              </div>

              {currentMeme && (
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-700/80 text-xs space-y-1 text-slate-200">
                  <div className="font-semibold text-amber-400">[{currentMeme.tag}] {currentMeme.setup}</div>
                  <div className="text-slate-300 italic">👉 {currentMeme.punchline}</div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={handleDrawMemeDay}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {currentMeme ? 'Mème suivant' : 'Tirer le Mème du jour'}
                </button>

                {currentMeme && (
                  <>
                    <button
                      onClick={handleToggleValidateCurrentMeme}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 border ${
                        memeStatus === 'VALIDE'
                          ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {memeStatus === 'VALIDE' ? 'Marquer à relire' : 'Valider ce mème'}
                    </button>

                    <button
                      onClick={handleRewriteMemeWithAi}
                      disabled={isGeneratingAi}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isGeneratingAi ? 'Réécriture IA...' : 'Réécrire avec l\'IA'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* 1. Sélection de la recette prédéfinie */}
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Choisir une Recette Officielle
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_DEFS.map((p) => {
                  const isSelected = p.id === selectedPresetId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPresetId(p.id)}
                      className={`text-left p-3 rounded-xl border transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs text-white">{p.label}</div>
                        <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {p.description}
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">
                        Palette : {p.defaultPalette}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Saisie des champs de la recette sélectionnée */}
            {currentPreset && (
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-4">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Saisie rapide — {currentPreset.label}
                </h4>

                <div className="space-y-3">
                  {currentPreset.inputs.map((inp) => {
                    const value = presetFormValues[inp.id] ?? inp.defaultValue ?? '';

                    if (inp.type === 'array') {
                      const list = Array.isArray(value) ? value : [value];
                      return (
                        <div key={inp.id} className="space-y-1">
                          <label className="text-xs text-slate-300 font-semibold block">
                            {inp.label}
                          </label>
                          {list.map((itemVal, idx) => (
                            <input
                              key={idx}
                              type="text"
                              value={itemVal}
                              onChange={(e) => {
                                const nextList = [...list];
                                nextList[idx] = e.target.value;
                                setPresetFormValues({
                                  ...presetFormValues,
                                  [inp.id]: nextList,
                                });
                              }}
                              className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white mb-1"
                            />
                          ))}
                        </div>
                      );
                    }

                    return (
                      <div key={inp.id}>
                        <label className="text-xs text-slate-300 font-semibold block mb-1">
                          {inp.label} {inp.required && <span className="text-red-400">*</span>}
                        </label>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) =>
                            setPresetFormValues({
                              ...presetFormValues,
                              [inp.id]: e.target.value,
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleGenerateFromPreset}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl shadow flex items-center justify-center gap-2 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Générer le visuel depuis cette recette
                </button>
              </div>
            )}

            {/* 3. Section Mes Recettes Personnelles */}
            {myRecipes.length > 0 && (
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Bookmark className="w-4 h-4" /> Mes Recettes Sauvegardées ({myRecipes.length}/20)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {myRecipes.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleSelectRecipe(r)}
                      className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 hover:border-amber-500 cursor-pointer transition flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-bold text-xs text-white group-hover:text-amber-300">
                          {r.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.spec.blocks.length} blocs • {r.spec.palette}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteRecipe(r.id, e)}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition"
                        title="Supprimer la recette"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ONGLET 2 : ÉDITEUR LIBRE DE BLOCS */}
        {activeTab === 'EDITOR' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Style & Format Global */}
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" /> Style & Format du Visuel
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Format</label>
                  <select
                    value={spec.format}
                    onChange={(e) =>
                      setSpec({ ...spec, format: e.target.value as SocialVisualFormat })
                    }
                    className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                  >
                    <option value="SQUARE">Carré (1080×1080)</option>
                    <option value="STORY">Story (1080×1920)</option>
                    <option value="BANNER">Bannière (1920×1080)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Palette</label>
                  <select
                    value={spec.palette}
                    onChange={(e) =>
                      setSpec({ ...spec, palette: e.target.value as SocialVisualPalette })
                    }
                    className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                  >
                    <option value="EMERALD_GOLD">Émeraude & Or</option>
                    <option value="EBONY_GOLD">Ébène & Or VIP</option>
                    <option value="ROYAL_SAPPHIRE">Saphir Royal</option>
                    <option value="SUNSET_TERRACOTTA">Terre Cuite Sunset</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">Motif Culturel</label>
                  <select
                    value={spec.pattern}
                    onChange={(e) =>
                      setSpec({ ...spec, pattern: e.target.value as SocialVisualPattern })
                    }
                    className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                  >
                    <option value="NDOP_CHEVRON">Chevrons Ndop</option>
                    <option value="DIAMONDS">Losanges Géométriques</option>
                    <option value="MINIMAL">Épuré & Minimal</option>
                  </select>
                </div>
              </div>

              {/* CTA */}
              <div className="pt-1">
                <label className="text-xs text-slate-400 block mb-1">
                  Texte du Bouton CTA ({spec.cta.text.length}/25 max)
                </label>
                <input
                  type="text"
                  maxLength={25}
                  value={spec.cta.text}
                  onChange={(e) => setSpec({ ...spec, cta: { ...spec.cta, text: e.target.value } })}
                  className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-amber-300 font-semibold"
                  placeholder="ex: Viens tester la bêta"
                />
              </div>
            </div>

            {/* Séquence des Blocs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-amber-400" /> Blocs du Visuel ({spec.blocks.length})
                </h3>
                <button
                  onClick={() => setShowAddMenu(!showAddMenu)}
                  className="text-xs px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter un bloc
                </button>
              </div>

              {/* Menu d'ajout de bloc */}
              {showAddMenu && (
                <div className="bg-slate-800 p-3 rounded-xl border border-amber-500/40 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-fadeIn">
                  {(Object.keys(BLOCK_DEFS) as VisualBlockType[]).map((type) => {
                    const def = BLOCK_DEFS[type];
                    return (
                      <button
                        key={type}
                        onClick={() => addBlock(type)}
                        className="text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-700 border border-slate-700/60 transition group"
                      >
                        <div className="text-xs font-bold text-amber-400 group-hover:text-amber-300">
                          {def.label} ({type})
                        </div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">
                          {def.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Liste des blocs */}
              <div className="space-y-2">
                {spec.blocks.map((block, index) => {
                  const isEditing = block.id === editingBlockId;
                  const def = BLOCK_DEFS[block.type];

                  let summaryText = '';
                  if (
                    block.type === 'HOOK' ||
                    block.type === 'BODY' ||
                    block.type === 'BADGE' ||
                    block.type === 'QUOTE'
                  ) {
                    summaryText = (block as any).text || '';
                  } else if (block.type === 'STAT') {
                    summaryText = `${(block as StatBlock).value} - ${(block as StatBlock).label}`;
                  } else if (block.type === 'CARDS') {
                    summaryText = `${(block as CardsBlock).cards?.length || 0} cartes (${
                      (block as CardsBlock).arrangement
                    })`;
                  } else if (block.type === 'IMAGE') {
                    summaryText = (block as ImageBlock).dataUrl
                      ? 'Image chargée'
                      : 'Aucune image';
                  } else if (block.type === 'EVENT') {
                    summaryText = `${(block as EventBlock).date} | ${(block as EventBlock).prize}`;
                  } else {
                    summaryText = `${def?.label || block.type}`;
                  }

                  return (
                    <div
                      key={block.id}
                      className={`p-3 rounded-xl border transition ${
                        isEditing
                          ? 'bg-slate-800 border-amber-400'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                            {block.type}
                          </span>
                          <span className="text-xs text-slate-200 truncate max-w-[180px] sm:max-w-[260px]">
                            {summaryText}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveBlock(index, 'UP')}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveBlock(index, 'DOWN')}
                            disabled={index === spec.blocks.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingBlockId(isEditing ? null : block.id)}
                            className={`p-1 ${
                              isEditing ? 'text-amber-400' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteBlock(block.id)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Formulaire spécifique */}
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-slate-700/80 space-y-3 animate-fadeIn">
                          {block.type === 'BADGE' && (
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">
                                Texte du Badge ({(block as any).text?.length || 0}/20)
                              </label>
                              <input
                                type="text"
                                maxLength={20}
                                value={(block as any).text}
                                onChange={(e) => updateBlock({ ...block, text: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                              />
                            </div>
                          )}

                          {block.type === 'HOOK' && (
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-slate-400 block mb-1">
                                  Texte de l'Accroche ({(block as HookBlock).text.length}/60)
                                </label>
                                <input
                                  type="text"
                                  maxLength={60}
                                  value={(block as HookBlock).text}
                                  onChange={(e) =>
                                    updateBlock({ ...block, text: e.target.value } as HookBlock)
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                                />
                              </div>
                            </div>
                          )}

                          {block.type === 'BODY' && (
                            <div>
                              <label className="text-xs text-slate-400 block mb-1">
                                Texte du Corps ({(block as BodyBlock).text.length}/140)
                              </label>
                              <textarea
                                rows={3}
                                maxLength={140}
                                value={(block as BodyBlock).text}
                                onChange={(e) =>
                                  updateBlock({ ...block, text: e.target.value } as BodyBlock)
                                }
                                className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg p-2.5 text-white"
                              />
                            </div>
                          )}

                          {block.type === 'STAT' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-slate-400 block mb-1">Chiffre</label>
                                <input
                                  type="text"
                                  value={(block as StatBlock).value}
                                  onChange={(e) =>
                                    updateBlock({ ...block, value: e.target.value } as StatBlock)
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-amber-300 font-bold"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400 block mb-1">Libellé</label>
                                <input
                                  type="text"
                                  value={(block as StatBlock).label}
                                  onChange={(e) =>
                                    updateBlock({ ...block, label: e.target.value } as StatBlock)
                                  }
                                  className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg px-3 py-2 text-white"
                                />
                              </div>
                            </div>
                          )}

                          {block.type === 'IMAGE' && (
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-slate-400 block mb-1">
                                  Image Locale (Optimisation auto max 1080px)
                                </label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleImageUpload(e, block as ImageBlock)}
                                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500 file:text-slate-950 file:font-semibold"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <label className="text-xs text-slate-400">Priorité de conservation</label>
                            <select
                              value={block.priority || 2}
                              onChange={(e) =>
                                updateBlock({ ...block, priority: parseInt(e.target.value) as any })
                              }
                              className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 text-white"
                            >
                              <option value={1}>Priorité 1 (Gardé en priorité)</option>
                              <option value={2}>Priorité 2 (Normal)</option>
                              <option value={3}>Priorité 3 (Supprimable)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ONGLET 3 : LÉGENDES RÉSEAUX SOCIAUX */}
        {activeTab === 'CAPTIONS' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/80">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
                <span>Légendes Réseaux (Générées depuis les blocs)</span>
                <button
                  onClick={() => setCaptions(buildCaptions(spec))}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Régénérer
                </button>
              </h3>
            </div>

            {/* 1. Facebook */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  Facebook (≤ 90 car. d'accroche, 3 emojis max, hashtags)
                </span>
                <button
                  onClick={() => handleCopyCaption(captions.facebook, 'fb')}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition"
                >
                  {copiedKey === 'fb' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'fb' ? 'Copié !' : 'Copier Facebook'}
                </button>
              </div>
              <textarea
                rows={5}
                value={captions.facebook}
                onChange={(e) => setCaptions({ ...captions, facebook: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg p-2.5 text-slate-200 font-mono"
              />
            </div>

            {/* 2. Groupe WhatsApp */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  Groupe WhatsApp (Aucun hashtag, liens croisés)
                </span>
                <button
                  onClick={() => handleCopyCaption(captions.whatsappGroup, 'wagroup')}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition"
                >
                  {copiedKey === 'wagroup' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'wagroup' ? 'Copié !' : 'Copier groupe WhatsApp'}
                </button>
              </div>
              <textarea
                rows={5}
                value={captions.whatsappGroup}
                onChange={(e) => setCaptions({ ...captions, whatsappGroup: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg p-2.5 text-slate-200 font-mono"
              />
            </div>

            {/* 3. Statut WhatsApp */}
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-green-400 flex items-center gap-1.5">
                  Statut WhatsApp (Max 3 lignes, 1 lien direct)
                </span>
                <button
                  onClick={() => handleCopyCaption(captions.whatsappStatus, 'wastatus')}
                  className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition"
                >
                  {copiedKey === 'wastatus' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'wastatus' ? 'Copié !' : 'Copier statut WhatsApp'}
                </button>
              </div>
              <textarea
                rows={3}
                value={captions.whatsappStatus}
                onChange={(e) => setCaptions({ ...captions, whatsappStatus: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-xs rounded-lg p-2.5 text-slate-200 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Colonne de Droite : Aperçu Canvas en Direct */}
      <div className="w-full lg:w-[400px] flex flex-col items-center gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between w-full">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <LayoutGrid className="w-4 h-4 text-amber-400" />
            Aperçu V2 ({spec.format})
          </span>
          <button
            onClick={() => setIsPhonePreview(!isPhonePreview)}
            className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1 transition ${
              isPhonePreview
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Tél. 390px
          </button>
        </div>

        <div
          className={`relative flex items-center justify-center transition-all ${
            isPhonePreview
              ? 'w-[390px] max-w-full p-4 bg-slate-900 rounded-[36px] border-4 border-slate-700 shadow-2xl'
              : 'w-full'
          }`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[480px] object-contain rounded-xl shadow-lg border border-slate-800"
          />
        </div>

        {layoutWarnings.length > 0 && (
          <div className="w-full bg-amber-950/60 border border-amber-500/50 p-3 rounded-xl text-amber-300 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-4 h-4" /> Ajustements automatiques
            </div>
            {layoutWarnings.map((w, idx) => (
              <div key={idx} className="leading-snug">
                • {w}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {downloading ? 'Génération PNG...' : 'Télécharger le PNG (1080p)'}
        </button>
      </div>

      {/* Modal de sauvegarde de recette */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Save className="w-4 h-4" /> Sauvegarder la Recette
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-semibold block">
                Nom de la recette
              </label>
              <input
                type="text"
                value={newRecipeName}
                onChange={(e) => setNewRecipeName(e.target.value)}
                placeholder="ex: Mon Modèle Tournoi"
                className="w-full bg-slate-950 border border-slate-700 text-xs rounded-xl p-3 text-white"
              />
              <p className="text-[11px] text-slate-400">
                La recette sauvegardera les blocs actuels, le style et le CTA (les images locales sont exclues).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveCurrentRecipe}
                disabled={!newRecipeName.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl disabled:opacity-50"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de génération IA */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Générer un Visuel V2 avec l'IA
              </h3>
              <button
                onClick={() => setShowAiModal(false)}
                disabled={isGeneratingAi}
                className="text-slate-400 hover:text-white disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs text-slate-300 font-semibold block">
                Décris le visuel souhaité (ou choisis un sujet)
              </label>
              <textarea
                rows={4}
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                placeholder="ex: Annonce le tournoi du week-end avec 5000 jetons à gagner et rappelle de rejoindre le groupe WhatsApp..."
                disabled={isGeneratingAi}
                className="w-full bg-slate-950 border border-slate-700 text-xs rounded-xl p-3 text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
              />

              {aiError && (
                <div className="p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{aiError}</span>
                </div>
              )}

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">💡 Exemples de brief :</div>
                <div>• « Affiche mème drôle sur les joueurs qui perdent au Kora »</div>
                <div>• « Comparatif 1vs1 entre joueur prudent et joueur offensif »</div>
                <div>• « Annonce de mise à jour avec nouvelle version bêta »</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAiModal(false)}
                disabled={isGeneratingAi}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerateWithAi}
                disabled={!aiBrief.trim() || isGeneratingAi}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50 shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isGeneratingAi ? 'Génération en cours...' : 'Générer le Spec V2'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
