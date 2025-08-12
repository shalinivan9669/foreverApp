'use client';

import { useRouter } from 'next/navigation';

type Props = {
  title?: string;
  fallbackHref?: string; // куда идти, если нет истории
  rightSlot?: React.ReactNode;
};

export default function BackBar({ title, fallbackHref = '/main-menu', rightSlot }: Props) {
  const router = useRouter();

  const goBack = () => {
    // если пришли из нашего же домена — назад, иначе в fallback
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
    <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-5xl mx-auto h-12 px-3 flex items-center gap-3">
        <button
          onClick={goBack}
          aria-label="Назад"
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {title && <div className="font-medium truncate">{title}</div>}
        <div className="ml-auto">{rightSlot}</div>
      </div>
    </div>
  );
}
