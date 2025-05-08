"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function HomePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <p className="p-4">Загрузка...</p>;
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen">
        <button
          onClick={() => signIn("discord")}
          className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Войти через Discord
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4">
      <h1 className="text-3xl font-semibold">
        Привет, {session.user.name}!
      </h1>
      {session.user.image && (
        <img
          src={session.user.image}
          alt="Аватар"
          className="w-24 h-24 rounded-full border-2 border-indigo-600"
        />
      )}
      <button
        onClick={() => signOut()}
        className="mt-4 px-4 py-2 border rounded hover:bg-gray-100 transition"
      >
        Выйти
      </button>
    </div>
  );
}
