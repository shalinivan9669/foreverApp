"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";

export default function HomePage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <p className="p-4">Загрузка...</p>;
  }


 // если нет сессии или session.user — на вход
 if (!session?.user) {
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

 // здесь гарантированно есть session.user
  const { user } = session;

  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4">

     <h1 className="text-3xl font-semibold">
       Привет, {user.name ?? "Друг"}!
     </h1>
     {user.image && (
       <Image
         src={user.image}
         alt="Аватар"
         width={96}
         height={96}
         className="rounded-full border-2 border-indigo-600"
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
