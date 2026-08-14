import type { MatchFitDTO } from "@/client/api/match.api";
import { toMatchFitViewModel } from "@/client/viewmodels/matching";

export default function FitSummary({ fit }: { fit: MatchFitDTO }) {
  const viewModel = toMatchFitViewModel(fit);
  return (
    <div className={`rounded-xl border p-3 ${viewModel.toneClassName}`}>
      <p className="font-semibold">{viewModel.title}</p>
      <p className="mt-1 text-sm">{viewModel.description}</p>
      <p className="mt-2 text-xs opacity-75">{viewModel.confidenceLabel}</p>
      {fit.explanations.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {fit.explanations.map((explanation) => (
            <li key={explanation}>{explanation}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
