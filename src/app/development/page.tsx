import DevelopmentPage from "@/features/development/DevelopmentPage";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Загружаем библиотеку…</p>}>
      <DevelopmentPage />
    </Suspense>
  );
}
