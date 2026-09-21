import React from 'react';

export interface SegmentTab<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number | null;
  badgeColor?: string;
}

export interface NativeSegmentedNavProps<T extends string = string> {
  tabs: SegmentTab<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Unified segmented navigation bar for Njambo Kora screens (Profile, Solo Setup, Multiplayer).
 * Strict mathematical ratio, no hidden horizontal scroll, unified amber active state.
 */
export function NativeSegmentedNav<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = 'Navigation par onglets',
  className = '',
}: NativeSegmentedNavProps<T>) {
  // Compute appropriate grid columns
  const gridColsClass =
    tabs.length === 2
      ? 'grid-cols-2'
      : tabs.length === 3
      ? 'grid-cols-3'
      : tabs.length === 4
      ? 'grid-cols-4'
      : tabs.length === 5
      ? 'grid-cols-5'
      : 'grid-cols-6';

  return (
    <nav
      aria-label={ariaLabel}
      className={`shrink-0 bg-slate-900/90 border-b border-slate-800/80 px-2 sm:px-6 py-2 sm:py-2.5 z-20 ${className}`}
    >
      <div
        className={`max-w-2xl mx-auto grid ${gridColsClass} gap-1 p-1 bg-slate-950/90 rounded-xl border border-slate-800/90 shadow-inner`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`tab-btn-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={`h-9 sm:h-10 px-1 sm:px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer select-none relative ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              {Icon && (
                <Icon
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 transition-transform ${
                    isActive ? 'text-slate-950 scale-105' : 'text-slate-400'
                  }`}
                />
              )}
              <span className="truncate">
                {tab.shortLabel ? (
                  <>
                    <span className="inline sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </span>

              {/* Optional Notification badge */}
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ml-0.5 shrink-0 ${
                    tab.badgeColor || (isActive ? 'bg-slate-950 text-amber-400' : 'bg-rose-500 text-white animate-pulse')
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
