import Link from "next/link";

export default function SearchPairTile() {
  return (
    <Link
      href="/search"
      className="row-span-2 col-start-1 bg-lime-200 border border-gray-400 flex items-center justify-center"
    >
      Поиск пары
    </Link>
  );
}
