'use client';

type EmptyStateViewProps = {
  title: string;
  description?: string;
};

export default function EmptyStateView({ title, description }: EmptyStateViewProps) {
  return (
    <div className="app-panel-soft app-reveal border-dashed p-4 text-sm text-slate-700" role="status">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200/75 text-xs text-slate-700">
          i
        </span>
        <div className="min-w-0 app-reading-width">
          <p className="app-heading text-base text-slate-900">{title}</p>
          {description && (
            <p className="app-muted mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
