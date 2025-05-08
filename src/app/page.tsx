// файл: src/app/page.tsx
import Image from "next/image";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./api/auth/[...nextauth]/route";
 

// Говорим Next.js, что страница должна всегда рендериться динамически
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    // если нет сессии — показываем кнопку входа
    return <div><p>Hi</p></div>;
  }

  // иначе — имя и аватар
  return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4">
      <Image
        src={session.user.image!}
        alt="Аватар"
        width={96}
        height={96}
        className="rounded-full border-2 border-indigo-600"
      />
      <h1 className="text-3xl font-semibold">
        Привет, {session.user.name}!
      </h1>
    </div>
  );
}
