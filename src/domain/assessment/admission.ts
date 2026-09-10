import { z } from 'zod';

export const ASSESSMENT_TERMS_VERSION = 'assessment-terms-2026-09-10';
export const ASSESSMENT_INFORMATION_VERSION = 'assessment-data-flow-2026-09-10';
/** Registration is limited to this explicit, reviewed scope; new registry entries are never implied. */
export const ASSESSMENT_REGISTRATION_PUBLICATIONS = [
  'dom-s07-household-pilot',
  'dom-s07-application-clarification-beta',
  ...['dom-s07', 'com-s02', 'com-s04'].flatMap(topic => ['knowledge', 'task', 'application'].map(method => `${topic}-${method}-beta`)),
] as const;
export const AssessmentChoicesSchema = z.object({
  ownerAssessment: z.boolean(), discovery: z.boolean(), pairSharing: z.boolean(),
  publicationIds: z.array(z.string().min(1).max(120)).max(11).refine(ids => new Set(ids).size === ids.length),
}).strict();
export type AssessmentChoices = z.infer<typeof AssessmentChoicesSchema>;
export const AssessmentRegistrationSchema = z.object({
  viewerToken: z.string().length(64), idempotencyKey: z.string().uuid(),
  termsAccepted: z.literal(true), adultConfirmed: z.literal(true),
  termsVersion: z.literal(ASSESSMENT_TERMS_VERSION), informationVersion: z.literal(ASSESSMENT_INFORMATION_VERSION),
  ownerAssessment: z.boolean(), discovery: z.boolean(), pairSharing: z.boolean(),
}).strict();
export type AssessmentRegistration = z.infer<typeof AssessmentRegistrationSchema>;
export const AssessmentSettingsMutationSchema = AssessmentChoicesSchema.extend({
  viewerToken: z.string().length(64), expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type AssessmentSettingsMutation = z.infer<typeof AssessmentSettingsMutationSchema>;
export const AssessmentSupportInputSchema = z.object({
  viewerToken: z.string().length(64), idempotencyKey: z.string().uuid(),
  category: z.enum(['CLARITY', 'INAPPROPRIATE', 'BUG', 'PRIVACY']), message: z.string().trim().min(1).max(2000),
  publicationId: z.string().min(1).max(120).optional(),
  attachResult: z.object({ runId: z.string().min(1).max(180), revision: z.number().int().nonnegative(), consent: z.literal(true) }).strict().optional(),
}).strict();
export type AssessmentSupportInput = z.infer<typeof AssessmentSupportInputSchema>;
export type AssessmentSupportDTO = { id: string; category: AssessmentSupportInput['category']; status: 'OPEN' | 'RESOLVED'; createdAt: string; attachedResult: boolean };
export const AssessmentWithdrawSchema = z.object({ viewerToken: z.string().length(64), expectedRevision: z.number().int().nonnegative() }).strict();
export type AssessmentWithdraw = z.infer<typeof AssessmentWithdrawSchema>;
export const ASSESSMENT_DATA_FLOW = [
  { origin: 'API_DATA', data: 'Идентификатор аккаунта Discord', purpose: 'Вход и привязка ваших записей к аккаунту', recipients: 'Сервер приложения и поставщик входа Discord; ответы анкет не отправляются Discord', retention: 'До удаления аккаунта; минимальный журнал отзыва покрывает срок восстановления резервных копий' },
  { origin: 'USER_INPUT', data: 'Ответы, периоды наблюдений, отдельные результаты понимания, задания, применения и описанных негативных эпизодов по трём темам: бытовая ответственность, конкретная просьба, пауза и возврат к разговору', purpose: 'Сохранение, автоматический пересчёт и личная история выбранных анкет', recipients: 'Вы и сервер приложения; технический хостинг и резервное хранение в согласованной оператором среде', retention: 'Черновики 30 дней без активности; завершённые источники 180 дней; удаление доступно в настройках' },
  { origin: 'USER_INPUT', data: 'Разрешённые условия, предложения и ограниченные выводы по применению', purpose: 'Поиск при отдельном включении; обсуждение в текущей паре при отдельном включении', recipients: 'Допущенные кандидаты или текущий партнёр получают только описанные краткие выводы, без личных ответов и негативных показателей', retention: 'Права проверяются при каждом использовании; отзыв прекращает новую выдачу сразу' },
  { origin: 'APP_EVENT', data: 'Время и содержание выбора, версия условий, технические коды операций', purpose: 'Соблюдение настроек, восстановление и поддержка', recipients: 'Уполномоченный оператор; поддержка видит добровольно отправленное обращение и только явно приложенный результат', retention: 'Технические события 7 дней; обращения 30 дней после закрытия; журнал отзыва по принятой политике восстановления' },
] as const;
export type AssessmentRegistrationReceipt = { termsVersion: string; informationVersion: string; acceptedAt: string; adultPolicy: 'SELF_DECLARED_18_PLUS'; choices: AssessmentChoices; operationKey: string; requestIntent?: string; sessionVersion?: string };
export type AssessmentSettingsDTO = {
  mode: 'OFF' | 'SYNTHETIC' | 'PRIVATE_BETA' | 'REGISTERED'; admission: 'ELIGIBLE' | 'INVITED' | 'ACTIVE' | 'REVOKED' | 'UNAVAILABLE';
  revision: number; viewerToken: string; termsVersion: string; informationVersion: string;
  registration: AssessmentRegistrationReceipt | null; settings: AssessmentChoices;
  dataFlow: typeof ASSESSMENT_DATA_FLOW; availablePublicationIds: string[];
};
