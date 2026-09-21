import React from 'react';

interface QuickPreset {
  label: string;
  value: number;
}

interface KatikaNumberSliderFieldProps {
  id?: string;
  label: string;
  description?: string;
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  presets?: QuickPreset[];
  accentColor?: 'amber' | 'cyan' | 'emerald' | 'purple' | 'rose';
  disabled?: boolean;
}

export const KatikaNumberSliderField: React.FC<KatikaNumberSliderFieldProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  presets,
  accentColor = 'cyan',
  disabled = false,
}) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (isNaN(raw)) return;
    onChange(Math.max(min, Math.min(max, raw)));
  };

  const accentClasses = {
    amber: {
      text: 'text-amber-400',
      border: 'focus:border-amber-500',
      accent: 'accent-amber-500',
      activePreset: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    cyan: {
      text: 'text-cyan-400',
      border: 'focus:border-cyan-500',
      accent: 'accent-cyan-400',
      activePreset: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
    emerald: {
      text: 'text-emerald-400',
      border: 'focus:border-emerald-500',
      accent: 'accent-emerald-400',
      activePreset: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    purple: {
      text: 'text-purple-400',
      border: 'focus:border-purple-500',
      accent: 'accent-purple-400',
      activePreset: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    },
    rose: {
      text: 'text-rose-400',
      border: 'focus:border-rose-500',
      accent: 'accent-rose-400',
      activePreset: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    },
  }[accentColor];

  return (
    <div id={id} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 transition-all hover:border-slate-700/80">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="text-xs font-semibold text-slate-200">{label}</label>
        
        {/* Synchronized text input field with unit */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={handleInputChange}
            className={`w-16 bg-transparent text-right ${accentClasses.text} font-mono font-bold text-xs outline-none`}
          />
          <span className="text-[11px] font-mono text-slate-400 select-none">{unit}</span>
        </div>
      </div>

      {description && (
        <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
      )}

      {/* Direct Range Slider */}
      <div className="space-y-1.5 pt-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full cursor-pointer h-1.5 rounded-lg bg-slate-800 ${accentClasses.accent}`}
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>{min} {unit}</span>
          <span>{Math.round((min + max) / 2)} {unit}</span>
          <span>{max} {unit}</span>
        </div>
      </div>

      {/* Optional Presets */}
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-medium border transition cursor-pointer ${
                value === p.value
                  ? accentClasses.activePreset
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label} ({p.value}{unit})
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
