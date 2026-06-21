interface QueryErrorProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
}

export function QueryError({ error, message, onRetry }: QueryErrorProps): JSX.Element {
  const text = message ?? (error as any)?.message ?? 'Something went wrong. Please try again.';
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <span className="text-danger text-xl font-bold">!</span>
      </div>
      <div className="text-sm font-medium text-ink mb-1">Failed to load data</div>
      <div className="text-xs text-muted max-w-sm mb-4">{text}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-xs bg-accent text-white rounded hover:bg-accent/90"
        >
          Try again
        </button>
      )}
    </div>
  );
}

interface InlineErrorProps {
  message?: string;
}

export function InlineError({ message }: InlineErrorProps): JSX.Element {
  return (
    <div className="text-xs text-danger bg-danger/5 border border-danger/20 rounded px-3 py-2">
      {message ?? 'Failed to load. Refresh to retry.'}
    </div>
  );
}
