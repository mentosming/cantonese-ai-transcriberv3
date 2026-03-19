import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 m-2">
          <AlertCircle size={32} className="text-red-500 mb-3" />
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-1">
            {this.props.fallbackMessage || '組件載入失敗'}
          </h3>
          <p className="text-xs text-red-600 dark:text-red-400 mb-4 max-w-sm">
            {this.state.error?.message || '發生未預期的錯誤'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw size={14} /> 重試
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
