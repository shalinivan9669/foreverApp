import Link from "next/link";

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaire"
      className="bg-lime-100 border border-gray-400 flex items-center justify-center"
    >
      Анкетирование
    </Link>
  );
}
