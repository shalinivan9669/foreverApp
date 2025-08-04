import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link href="/questionnaires"
          className="bg-lime-100 border flex items-center justify-center">
      Анкетирование
    </Link>
  );
}
