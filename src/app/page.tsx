'use client';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function WelcomePage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/main-menu');
  }, [status, router]);

  if (status === 'loading') {
    return <div className="h-screen flex items-center justify-center">Загрузка…</div>;
  }
  return (
    <div className="h-screen flex flex-col items-center justify-center space-y-6">
      <h1 className="text-3xl font-bold">Привет! Готов?</h1>
      <button
        onClick={() => signIn('discord')}
        className="px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
      >
        ПОЕХАЛИ
      </button>
    </div>
  );
}
