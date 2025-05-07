import Link from "next/link";

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="bg-yellow-100 border border-gray-400 flex items-center justify-center"
    >
      ЛУТБОКСЫ
    </Link>
  );
}
