'use client';

type EmptyStateViewProps = {
  title: string;
  description?: string;
};

export default function EmptyStateView({ title, description }: EmptyStateViewProps) {
  return (
    <div className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-600">
      <p className="font-medium text-gray-700">{title}</p>
      {description && <p className="mt-1">{description}</p>}
    </div>
  );
}
