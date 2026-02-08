'use client';

type EmptyStateViewProps = {
  title: string;
  description?: string;
};

export default function EmptyStateView({ title, description }: EmptyStateViewProps) {
  return (
    <div className="app-panel-soft border-dashed p-4 text-sm text-slate-700">
      <p className="font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 app-muted">{description}</p>}
    </div>
  );
}
