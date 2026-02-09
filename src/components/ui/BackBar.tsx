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
    <div className="app-panel app-reveal sticky top-0 z-10 bg-white/90 text-slate-900 backdrop-blur">
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-2 px-2 sm:h-12 sm:gap-3 sm:px-3">
        <button
          onClick={goBack}
          aria-label="Назад"
          className="rounded-md border border-transparent p-1.5 transition hover:border-slate-200 hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {title && <div className="truncate text-[15px] font-semibold sm:text-base">{title}</div>}
        <div className="ml-auto">{rightSlot}</div>
      </div>
    </div>
  );
}
