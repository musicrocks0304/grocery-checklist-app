import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { reportError } from '../telemetry/errorReporter';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    reportError({ kind: 'boundary', error });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 transition-colors duration-200">
          <div className="bg-surface rounded-2xl shadow-warm max-w-md w-full p-8 text-center transition-colors duration-200">
            <div className="w-16 h-16 bg-danger-light rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-danger" />
            </div>
            <h1 className="text-xl font-bold font-display text-heading mb-2">Something went wrong</h1>
            <p className="text-body mb-6">
              The app encountered an unexpected error. Try refreshing the page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors"
              >
                <RotateCcw size={16} />
                Refresh Page
              </button>
              <button
                onClick={this.handleDismiss}
                className="px-4 py-2 bg-default text-body rounded-xl hover:bg-background transition-colors"
              >
                Try Again
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-muted cursor-pointer">Error details</summary>
                <pre className="mt-2 p-3 bg-background rounded text-xs text-danger overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
