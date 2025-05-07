import Link from "next/link";

export default function ProfileTile() {
  return (
    <Link
      href="/profile"
      className="bg-pink-200 border border-gray-400 flex items-center justify-center"
    >
      Профиль
    </Link>
  );
}
