'use client';

type EmptyStateViewProps = {
  title: string;
  description?: string;
};

export default function EmptyStateView({ title, description }: EmptyStateViewProps) {
  const useAccentDescription = Boolean(description && description.length <= 42);

  return (
    <div className="app-panel-soft app-reveal border-dashed p-4 text-sm text-slate-700">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200/75 text-xs text-slate-700">
          i
        </span>
        <div>
          <p className="font-display text-lg font-semibold leading-tight text-slate-900">{title}</p>
          {description && (
            <p className={`mt-1 ${useAccentDescription ? 'font-accent text-base leading-snug' : 'app-muted'}`}>
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
