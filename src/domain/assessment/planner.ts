import { z } from 'zod';
import type { OwnerAssessmentProfileDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentSkillId } from './contracts';
const operation = { viewerToken: z.string().regex(/^[a-f0-9]{64}$/), expectedRevision: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(120) };
export const AssessmentPortfolioMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goal'), goal: z.enum(['SELF', 'DATING', 'COUPLE']), ...operation }).strict(),
  z.object({ action: z.literal('decline'), publicationId: z.string().min(1).max(120), ...operation }).strict(),
  z.object({ action: z.literal('explanation'), publicationId: z.string().min(1).max(120), accessibilitySupport: z.enum(['NONE', 'ASSISTIVE_TOOL']), ...operation }).strict(),
  z.object({ action: z.literal('practice-start'), skillId: z.enum(['DOM.S07', 'COM.S02', 'COM.S04']), goal: z.string().trim().min(1).max(300), mode: z.enum(['SOLO_REHEARSAL', 'OWN_ACTION']), ...operation }).strict(),
  z.object({ action: z.literal('practice-report'), practiceId: z.string().min(1).max(180), practiceRevision: z.number().int().nonnegative(), status: z.enum(['NO_OPPORTUNITY', 'NOT_ATTEMPTED', 'ATTEMPTED', 'DECLINED']), note: z.string().max(1200).default(''), observedAt: z.string().datetime().nullable().default(null), ...operation }).strict(),
]);
export type AssessmentPortfolioMutation = z.input<typeof AssessmentPortfolioMutationSchema>;
export type AssessmentPracticeDTO = { id: string; skillId: AssessmentSkillId; goal: string; mode: 'SOLO_REHEARSAL' | 'OWN_ACTION'; revision: number; status: 'STARTED' | 'NO_OPPORTUNITY' | 'NOT_ATTEMPTED' | 'ATTEMPTED' | 'DECLINED'; startedAt: string; reportedAt: string | null; note: string; observedAt: string | null };
export const ASSESSMENT_PRACTICES: Array<{ skillId: AssessmentSkillId; title: string; action: string; solo: string; resources: string; stop: string; observation: string }> = [
  { skillId: 'DOM.S07', title: 'Один небольшой бытовой цикл', action: 'Выберите лично принятую небольшую область. Запишите, как заметите задачу, составите план, выполните и проверите результат.', solo: 'Разберите вымышленный цикл или собственную задачу без участия партнёра.', resources: 'Вы сами выбираете доступное время и средства; можно уменьшить задачу.', stop: 'Остановитесь, если ресурса не хватает или участие перестало быть добровольным.', observation: 'После попытки можно отдельно описать новый реальный эпизод; сама практика не повышает уровень.' },
  { skillId: 'COM.S02', title: 'Репетиция одной просьбы', action: 'Выберите своё небольшое пожелание: действие, контекст, допустимый отказ и альтернативу с учётом ограничений.', solo: 'Соберите просьбу для вымышленной ситуации; отправлять её кому-либо не требуется.', resources: 'Достаточно доступного способа записи или мысленной репетиции.', stop: 'Не отправляйте просьбу, если контакт небезопасен, нежелателен или требуется давление.', observation: 'Сама репетиция не создаёт измеренный результат. Учебная задача и фактическая просьба описываются в отдельных формах.' },
  { skillId: 'COM.S04', title: 'Личный план паузы', action: 'Подготовьте доступную фразу остановки и предложение способа возвращения, оставляя подтверждение другому.', solo: 'Порепетируйте на вымышленной сцене без провоцирования трудного разговора.', resources: 'Нужен только выбранный доступный способ; точный срок учёбы не обещается.', stop: 'В небезопасном контакте можно закончить взаимодействие; возвращение не обязанность.', observation: 'Принятие плана не подтверждает согласование за второго. Новый эпизод описывается отдельно.' },
];
export interface AssessmentPortfolioDTO {
  viewerToken: string; revision: number; goal: 'SELF' | 'DATING' | 'COUPLE'; profile: OwnerAssessmentProfileDTO;
  publications: Array<{ id: string; version: string; skillId: string; title: string; status: 'DRAFT'; policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED'; tracks: string[]; contentHash: string; explanation: string; samplingFrame: string; runStatus: 'NEW' | 'DRAFT' | 'FINALIZED' | 'DELETED'; declined: boolean }>;
  planner: { publicationId: string | null; reasonCode: 'RESUME_DRAFT' | 'GOAL_RELEVANT_UNKNOWN' | 'TASK_CLARIFICATION' | 'ENOUGH_FOR_SELECTED_GOAL' | 'DECLINED_OR_UNAVAILABLE'; message: string };
  practiceCatalog: typeof ASSESSMENT_PRACTICES; practices: AssessmentPracticeDTO[];
}
/** A bounded deterministic next step; declines are remembered and never reframed as failure. */
export function planAssessmentNextStep(input: Pick<AssessmentPortfolioDTO, 'goal' | 'publications' | 'profile'>): AssessmentPortfolioDTO['planner'] {
  const candidates = input.publications.filter(publication => !publication.declined && publication.runStatus !== 'DELETED' && publication.id.endsWith('-beta'));
  const draft = candidates.find(publication => publication.runStatus === 'DRAFT');
  if (draft) return { publicationId: draft.id, reasonCode: 'RESUME_DRAFT', message: 'Можно продолжить сохранённый этап.' };
  const preferredSkill = input.goal === 'SELF' ? 'DOM.S07' : input.goal === 'DATING' ? 'COM.S02' : 'COM.S04';
  if (!candidates.some(publication => publication.skillId === preferredSkill)) return { publicationId: null, reasonCode: 'DECLINED_OR_UNAVAILABLE', message: 'Для выбранной цели сейчас нет доступной неотклонённой формы. Можно остановиться или самостоятельно выбрать другую тему.' };
  const knowledge = candidates.find(publication => publication.skillId === preferredSkill && publication.tracks.includes('K') && publication.runStatus === 'NEW');
  if (knowledge) return { publicationId: knowledge.id, reasonCode: 'GOAL_RELEVANT_UNKNOWN', message: 'Начните с одного небольшого модуля по выбранной цели. Другие темы добровольны.' };
  const task = candidates.find(publication => publication.skillId === preferredSkill && publication.tracks.includes('D') && publication.runStatus === 'NEW');
  if (task) return { publicationId: task.id, reasonCode: 'TASK_CLARIFICATION', message: 'По желанию можно проверить сборку плана в новой учебной сцене.' };
  return { publicationId: null, reasonCode: candidates.length ? 'ENOUGH_FOR_SELECTED_GOAL' : 'DECLINED_OR_UNAVAILABLE', message: 'На этом можно остановиться. Результат и добровольные практики уже доступны; заполнять весь банк не требуется.' };
}
