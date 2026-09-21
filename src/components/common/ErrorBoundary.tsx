import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  onClose?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      const isModal = Boolean(this.props.onClose);
      const content = (
        <div className="p-6 rounded-2xl bg-slate-900 border border-red-500/40 text-slate-100 max-w-lg w-full mx-auto my-6 shadow-2xl space-y-4 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-red-300">
              {this.props.fallbackTitle || 'Une erreur est survenue'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {this.props.fallbackMessage ||
                'Impossible de charger ce composant. Vos données locales sont sécurisées.'}
            </p>
            {this.state.error && (
              <div className="mt-2 p-2 bg-slate-950/80 rounded-lg border border-red-900/50 text-left overflow-x-auto max-h-32 text-[10px] font-mono text-red-300">
                <p className="font-bold">{this.state.error.name}: {this.state.error.message}</p>
                {this.state.error.stack && (
                  <p className="text-slate-500 mt-1 whitespace-pre-wrap">{this.state.error.stack.slice(0, 300)}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </button>
            {this.props.onClose && (
              <button
                onClick={this.props.onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Fermer
              </button>
            )}
          </div>
        </div>
      );

      if (isModal) {
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            {content}
          </div>
        );
      }

      return content;
    }

    return this.props.children;
  }
}
