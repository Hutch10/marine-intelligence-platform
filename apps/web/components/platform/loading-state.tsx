interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-6 text-center">
      <div className="flex justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
      </div>
      <p className="mt-3 text-xs text-slate-300">{message}</p>
    </div>
  );
}
