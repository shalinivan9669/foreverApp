'use client';

import { useRouter } from 'next/navigation';

type Props = {
  title?: string;
  fallbackHref?: string;
  rightSlot?: React.ReactNode;
};

export default function BackBar({ title, fallbackHref = '/main-menu', rightSlot }: Props) {
  const router = useRouter();

  const goBack = () => {
    const ref = document.referrer;
    try {
      const sameOrigin = ref && new URL(ref).origin === window.location.origin;
      if (sameOrigin) router.back();
      else router.push(fallbackHref);
    } catch {
      router.push(fallbackHref);
    }
  };

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white/85 text-slate-900 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-3">
        <button
          onClick={goBack}
          aria-label="Back"
          className="rounded-md border border-transparent p-1.5 transition hover:border-slate-200 hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {title && <div className="truncate font-medium">{title}</div>}
        <div className="ml-auto">{rightSlot}</div>
      </div>
    </div>
  );
}
