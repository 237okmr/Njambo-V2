import React from 'react';
import Markdown from 'react-markdown';
import { 
  Compass, 
  ArrowUpRight, 
  Users, 
  Dices, 
  Sliders, 
  ScrollText, 
  History, 
  LayoutDashboard,
  Download,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { KatikaTab } from '../types/katika';
import { navigateToKatikaTab } from '../utils/katikaNavigation';
import { KatikaSocialCardPreview } from './social/KatikaSocialCardPreview';
import { SocialVisualCardData } from '../types/socialVisuals';
import { VisualSpec } from '../visual/visualSpec';
import { downloadSpecPng } from '../visual/renderVisualSpec';
import { validateAndRepairSpec } from '../visual/validateSpec';

interface KatikaChatMessageRendererProps {
  content: string;
  onNavigate?: (tab: KatikaTab, query?: string) => void;
}

function tryParseVisualSpec(raw: string): { spec: VisualSpec; warnings: string[]; needsReview: boolean } | null {
  try {
    const startIdx = raw.indexOf('{');
    const endIdx = raw.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

    const jsonStr = raw.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.version === 2 &&
      Array.isArray(parsed.blocks)
    ) {
      const validated = validateAndRepairSpec(parsed);
      if (validated.spec) {
        return {
          spec: validated.spec,
          warnings: validated.warnings,
          needsReview: validated.needsReview || Boolean(validated.spec.meta?.needsReview),
        };
      }
      return { spec: parsed as VisualSpec, warnings: [], needsReview: false };
    }
  } catch {
    // Not valid JSON or not a V2 spec
  }
  return null;
}

function tryParseSocialCard(raw: string): SocialVisualCardData | null {
  try {
    const startIdx = raw.indexOf('{');
    const endIdx = raw.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

    const jsonStr = raw.substring(startIdx, endIdx + 1);
    const parsed = JSON.parse(jsonStr);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.theme === 'string' &&
      (parsed.headline || parsed.mainText) &&
      parsed.postCaption
    ) {
      return parsed as SocialVisualCardData;
    }
  } catch {
    // Not valid JSON or not a social card
  }
  return null;
}

export const KatikaChatMessageRenderer: React.FC<KatikaChatMessageRendererProps> = ({
  content,
  onNavigate,
}) => {
  // Pre-process content to extract social card JSON or V2 VisualSpec if present
  let cleanContent = content;
  const parsedV2 = tryParseVisualSpec(content);
  const v2Spec = parsedV2?.spec || null;
  const v2Warnings = parsedV2?.warnings || [];
  const v2NeedsReview = parsedV2?.needsReview || false;
  const socialCard = !v2Spec ? tryParseSocialCard(content) : null;
  
  if (v2Spec || socialCard) {
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      const before = content.substring(0, startIdx).trim();
      const after = content.substring(endIdx + 1).trim();
      // Remove Markdown json codeblocks that might wrap the JSON
      cleanContent = `${before}\n\n${after}`.replace(/```json/g, '').replace(/```/g, '').trim();
    }
  }

  const handleNavClick = (tabStr: string, query?: string) => {
    const validTabs: KatikaTab[] = [
      'DASHBOARD',
      'ROOMS',
      'MATCHES',
      'PLAYERS',
      'SETTINGS',
      'LOGS',
      'AI_ASSISTANT',
    ];
    const upper = tabStr.toUpperCase() as KatikaTab;
    if (validTabs.includes(upper)) {
      if (onNavigate) {
        onNavigate(upper, query);
      } else {
        navigateToKatikaTab(upper, query);
      }
    }
  };

  const getNavIcon = (tabStr: string) => {
    switch (tabStr.toUpperCase()) {
      case 'ROOMS':
        return <Dices className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'PLAYERS':
        return <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
      case 'SETTINGS':
        return <Sliders className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
      case 'LOGS':
        return <ScrollText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'MATCHES':
        return <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'DASHBOARD':
        return <LayoutDashboard className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Compass className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
  };

  // Adapter V2 Spec -> SocialVisualCardData pour la prévisualisation dans la carte legacy si nécessaire
  const convertedV2Data: SocialVisualCardData | undefined = v2Spec
    ? {
        theme: 'CULTURE_NJAMBO',
        palette: (v2Spec.palette as any) || 'EMERALD_GOLD',
        format: (v2Spec.format as any) || 'SQUARE',
        headline: v2Spec.blocks.find((b) => b.type === 'HOOK')?.text || 'Visuel Studio Katika V2',
        mainText: v2Spec.blocks.find((b) => b.type === 'BODY')?.text || '',
        ctaText: v2Spec.cta?.text || 'Viens tester la bêta',
        postCaption: v2Spec.captions?.facebook || '',
        whatsAppMessage: v2Spec.captions?.whatsappGroup || '',
        hashtags: ['#NjamboKora', '#Katika', '#JeudeCartes'],
      }
    : undefined;

  return (
    <div className="flex flex-col space-y-4">
      {cleanContent && (
      <div className="markdown-body text-xs space-y-2.5 leading-relaxed text-slate-200 selection:bg-amber-500/30">
        <Markdown
          components={{
          a: ({ href, children, ...props }) => {
            if (href && href.startsWith('#katika-nav:')) {
              // Format: #katika-nav:TAB:QUERY or #katika-nav:TAB
              const parts = href.replace('#katika-nav:', '').split(':');
              const targetTab = parts[0] || 'DASHBOARD';
              const query = parts.slice(1).join(':') || '';

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNavClick(targetTab, query);
                  }}
                  title={`Naviguer vers l'onglet ${targetTab}${query ? ` (recherche : "${query}")` : ''}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 my-1 mx-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/40 text-amber-200 hover:text-amber-100 font-semibold text-[11px] transition-all cursor-pointer shadow-sm group select-none align-middle"
                >
                  {getNavIcon(targetTab)}
                  <span>{children}</span>
                  <ArrowUpRight className="w-3 h-3 text-amber-400/80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline hover:text-amber-300 transition-colors"
                {...props}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-950/90 shadow-md">
              <table className="w-full text-left text-xs border-collapse divide-y divide-slate-800">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-900/90 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 border-b border-slate-700/80 font-semibold text-amber-400/90">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-300 border-b border-slate-800/60 leading-normal">
              {children}
            </td>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-slate-900/50 transition-colors">{children}</tr>
          ),
          pre: ({ children }) => <div className="my-1">{children}</div>,
          code: ({ className, children }) => {
            const rawText = Array.isArray(children)
              ? children.join('')
              : typeof children === 'string'
              ? children
              : '';

            const isBlock = Boolean(className) || rawText.includes('\n');
            if (isBlock) {
              return (
                <div className="p-3 my-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono text-[11px] overflow-x-auto">
                  <code>{children}</code>
                </div>
              );
            }

            return (
              <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300 font-mono text-[11px]">
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-1 pl-1 text-slate-300">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-1 pl-1 text-slate-300">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-amber-500/60 pl-3 py-1 my-2 bg-amber-500/5 rounded-r-lg text-slate-300 italic">
              {children}
            </blockquote>
          ),
          }}
        >
          {cleanContent}
        </Markdown>
      </div>
      )}

      {/* Rendu des visuels V2 */}
      {v2Spec && (
        <div className="space-y-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                Visuel V2
              </span>
              {(v2NeedsReview || v2Spec.meta?.needsReview) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  À relire
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleNavClick('SETTINGS', 'composer')}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ouvrir dans le Composer
              </button>
              <button
                type="button"
                onClick={() => downloadSpecPng(v2Spec)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                Télécharger
              </button>
            </div>
          </div>

          <KatikaSocialCardPreview data={convertedV2Data!} spec={v2Spec} />
        </div>
      )}

      {/* Legacy V1 Social Card */}
      {socialCard && (
        <KatikaSocialCardPreview data={socialCard} />
      )}
    </div>
  );
};
