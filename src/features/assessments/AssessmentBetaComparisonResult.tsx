import type { BetaComparisonResultDTO } from '@/lib/dto/assessmentBeta.dto';
const statusText: Record<BetaComparisonResultDTO['status'], string> = {
  TARGET_SUPPORTED: 'Условия поддержаны известными данными', FEASIBLE_WITH_DIFFERENCES: 'Есть допустимый план с различиями',
  NEEDS_CLARIFICATION: 'Нужно уточнение', NO_TARGET_PLAN_IN_CATALOG: 'В проверенном наборе нет целевого плана', INCOMPLETE: 'Проверка ограничена',
};
const directionText = { SUPPORTED: 'поддержано', NOT_SUPPORTED: 'не поддержано', UNRESOLVED: 'недостаточно данных' };
export function ComparisonResult({ result }: { result: BetaComparisonResultDTO }) {
  return <div className="space-y-2"><p className="font-semibold">{statusText[result.status]}</p><p>{result.explanation}</p>
    <dl className="grid gap-2 text-sm"><div><dt>Условия первого к предложению второго</dt><dd>{directionText[result.directions.A_FROM_B]}</dd></div><div><dt>Условия второго к предложению первого</dt><dd>{directionText[result.directions.B_FROM_A]}</dd></div><div><dt>Ресурс одного общего плана</dt><dd>{directionText[result.resourceStatus]}</dd></div></dl>
    <p className="app-muted text-sm">{result.completeness === 'BUDGET_EXCEEDED' ? 'Достигнут предел вычисления. Это не вывод о несовместимости.' : 'Вывод относится к явно проверенному ограниченному набору планов.'} Учтено известных условий: {result.matchedKnown} из {result.considered}. Это не вероятность успеха отношений.</p>
  </div>;
}
