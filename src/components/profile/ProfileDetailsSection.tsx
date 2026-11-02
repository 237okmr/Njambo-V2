import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ProfileDetailsSectionProps {
  title: string;
  children: React.ReactNode;
}

/** Bloc de détails qui se déplie à la demande : l'essentiel reste visible sans long défilement. */
export const ProfileDetailsSection: React.FC<ProfileDetailsSectionProps> = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <section className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-md overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="w-full min-h-12 px-4 py-3 flex items-center justify-between gap-3 text-left text-sm font-bold text-slate-200 hover:text-white transition cursor-pointer"
      >
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 text-amber-400 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 animate-in fade-in duration-150">{children}</div>}
    </section>
  );
};
