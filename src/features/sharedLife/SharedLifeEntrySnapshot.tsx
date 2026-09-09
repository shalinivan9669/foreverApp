import { sharedLifeEntryFields } from "@/client/viewmodels/sharedLife.viewmodels";
import type { SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";

export default function SharedLifeEntrySnapshot({ entry, myRole }: { entry: SharedLifeEntryDTO | null; myRole: "A" | "B" }) {
  if (!entry) return <p className="text-sm">Этой записи сейчас нет в общем пространстве.</p>;
  return <dl className="mt-3 space-y-3 text-sm">{sharedLifeEntryFields(entry.data, myRole).map((field) => <div key={field.label}>
    <dt className="app-muted">{field.label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words">{field.value}</dd>
  </div>)}</dl>;
}
