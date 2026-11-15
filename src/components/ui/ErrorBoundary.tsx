import { Component, type ErrorInfo, type ReactNode } from 'react';
import { NeuButton } from '@/components/ui/NeuButton';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleRefresh = () => {
        window.location.reload();
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="min-h-screen bg-neu-bg flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-neu-bg shadow-neu-flat rounded-[2rem] p-10 max-w-sm w-full flex flex-col items-center">
                        <div className="size-20 bg-neu-bg shadow-neu-pressed rounded-full flex items-center justify-center mb-6 text-red-500">
                            <span className="material-symbols-outlined text-[40px]">error</span>
                        </div>

                        <h1 className="text-xl font-bold text-neu-text mb-2">Something went wrong</h1>
                        <p className="text-sm text-neu-text-secondary mb-8">
                            An unexpected error has occurred. Please try refreshing the page.
                        </p>

                        {this.state.error && import.meta.env.DEV && (
                            <div className="w-full bg-red-50 text-red-800 text-xs p-4 rounded-xl text-left overflow-auto max-h-32 mb-6 font-mono">
                                {this.state.error.toString()}
                            </div>
                        )}

                        <NeuButton onClick={this.handleRefresh}>
                            Reload Page
                        </NeuButton>
                        <div className="h-4"></div>
                        <NeuButton onClick={() => window.location.href = '/'}>
                            Back to Home
                        </NeuButton>
                    </div>
                </div >
            );
        }

        return this.props.children;
    }
}
