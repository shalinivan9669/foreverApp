'use client';

type Props = {
  className?: string;
  lines?: number;
};

export default function Skeleton({ className = '', lines = 1 }: Props) {
  if (lines <= 1) {
    return <div className={`animate-pulse bg-zinc-200/60 rounded ${className}`} />;
  }
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="animate-pulse bg-zinc-200/60 rounded h-4 mb-2 last:mb-0" />
      ))}
    </div>
  );
}
