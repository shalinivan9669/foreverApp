import mongoose, { type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { disclosePairEvaluation } from '@/domain/model/privacy/disclosure';
import type { PairFactorEvaluationSnapshot as DomainEvaluation } from '@/domain/model/snapshots/snapshots';
import { materializeIndividual, materializeEvaluation, toDomainEvidenceEvent } from './activityFactorRuntime.service';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import type { MeasuredPairProfileDTO } from '@/lib/dto/measuredPairProfile.dto';
import { Pair } from '@/models/Pair';
import { EvidenceEvent, type EvidenceEventType } from '@/models/EvidenceEvent';
import { MeasurementTestSession } from '@/models/MeasurementTestSession';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { bridgeCompatibleProfileEvidence } from './profileEvidenceCompatibility.service';

const keys = ['communication.conflict.repairSkill', 'sharedLife.planning.structurePreference', 'sharedLife.values.relationshipPriority', 'finance.agreements.spendingDiscussion', 'intimacy.agreements.advanceDiscussion', 'wellbeing.current.overload'];

/** Transferable self-reports; weekly/activity retain their separate current-pair pipeline. */
export async function materializeMeasuredPairProfile(pairId: string, session: ClientSession): Promise<MeasuredPairProfileDTO> {
  const pair = await Pair.findOneAndUpdate({ _id: pairId, status: { $in: ['active', 'paused'] } }, { $inc: { lifecycleRevision: 1 } }, { session, new: true });
  if (!pair) throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'Контекст пары недоступен.' });
  // Reading/writing the owner fence prevents a concurrent revocation from
  // publishing an evaluation based on an obsolete permission snapshot.
  const { User } = await import('@/models/User');
  for (const id of [...pair.members].sort()) await User.updateOne({ id }, { $inc: { pairMembershipRevision: 1 } }, { session });
  for (const id of pair.members) await bridgeCompatibleProfileEvidence(id, undefined, session);
  const permissions = await MeasurementTestSession.find({ ownerId: { $in: pair.members }, status: 'FINALIZED', pairUse: true }).select({ _id: 1, permissionRevision: 1 }).limit(32).session(session).lean();
  const allowed = new Map(permissions.map((row) => [row._id, `test:${row._id}:permission:${row.permissionRevision}`]));
  const rows = await EvidenceEvent.aggregate<EvidenceEventType>([
    { $match: { subjectId: { $in: pair.members }, observationScope: 'SELF', subjectKind: 'INDIVIDUAL', pairId: { $exists: false }, factorKey: { $in: keys }, purpose: 'PAIR_MODEL', captureMode: { $in: ['PAIR_MODEL_ONLY', 'SHARED'] }, status: 'ACCEPTED', 'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion } },
    { $sort: { observedAt: -1, eventId: -1 } },
    { $group: { _id: { owner: '$subjectId', factor: '$factorKey' }, events: { $firstN: { input: '$$ROOT', n: 64 } } } },
    { $unwind: '$events' }, { $replaceWith: '$events' },
  ]).session(session);
  const events = rows.filter((row) => row.actorId === row.subjectId && (!row.sourceRef.startsWith('measurement:') || allowed.get(row.sourceRef.split(':')[1]) === row.consentRevision)).map(toDomainEvidenceEvent);
  const at = new Date();
  const cards: MeasuredPairProfileDTO['cards'] = [];
  for (const key of keys) {
    const factor = MVP_FACTOR_REGISTRY.factors.find((item) => item.key === key)!;
    const a = events.filter((event) => event.subjectId === pair.members[0] && event.factorKey === key);
    const b = events.filter((event) => event.subjectId === pair.members[1] && event.factorKey === key);
    const waiting = { factorKey: key, title: factor.title, state: 'WAITING' as const, meaning: 'Для общего вывода пока недостаточно актуальных разрешённых данных обоих участников.', nextAction: 'Откройте личные анкеты и проверьте разрешения. Закрытые ответы партнёра не показываются.', revision: null };
    if (!a.length || !b.length) { cards.push(waiting); continue; }
    const partnerA = await materializeIndividual({ subjectId: pair.members[0], factor, projectionPurpose: 'PAIR_MODEL', events: a, fallbackCalculatedAt: at, session });
    const partnerB = await materializeIndividual({ subjectId: pair.members[1], factor, projectionPurpose: 'PAIR_MODEL', events: b, fallbackCalculatedAt: at, session });
    if (partnerA.status !== 'AVAILABLE' || partnerB.status !== 'AVAILABLE') { cards.push(waiting); continue; }
    const snapshotId = await materializeEvaluation({ pairId, factor, partnerA, partnerB, calculatedAt: at, session });
    const stored = await PairFactorEvaluationSnapshot.findOne({ snapshotId }).session(session).lean();
    if (!stored) throw new Error('PAIR_MEASUREMENT_NOT_MATERIALIZED');
    const disclosed = disclosePairEvaluation(stored as DomainEvaluation, 'PAIR_MEMBER', true);
    if (disclosed.disclosure !== 'SUMMARY_ONLY') { cards.push(waiting); continue; }
    const status = disclosed.status;
    const ready = status !== 'INSUFFICIENT_DATA';
    cards.push({ factorKey: key, title: factor.title, state: ready ? 'READY' : 'WAITING', meaning: ready ? status === 'ALIGNED' ? 'По разрешённым данным есть общая опора для договорённости.' : 'Есть различия или потребность в поддержке: полезно обсудить удобный для обоих порядок.' : waiting.meaning,
      nextAction: key === 'wellbeing.current.overload' ? 'Снизьте нагрузку на ближайшую неделю и обсудите доступный объём поддержки. Обновить состояние можно в текущем цикле пары.' : key === 'communication.conflict.repairSkill' ? 'Выберите короткий разговор и согласуйте способ взять паузу и вернуться.' : key.startsWith('intimacy.') ? 'Обсудите удобное время разговора о близости. Каждый сохраняет право отказаться.' : key.startsWith('finance.') ? 'Согласуйте, какие общие расходы обсуждать заранее.' : 'Выберите одно совместное дело и договоритесь о времени и границах гибкости.', revision: stored.revision });
  }
  return { status: pair.status === 'paused' ? 'paused' : 'active', cards };
}

export async function refreshMeasuredPairsForOwner(ownerId: string): Promise<void> {
  const pairs = await Pair.find({ members: ownerId, status: { $in: ['active', 'paused'] } }).select({ _id: 1 }).limit(1).lean();
  for (const pair of pairs) {
    const session = await mongoose.startSession();
    try { await session.withTransaction(() => materializeMeasuredPairProfile(String(pair._id), session)); }
    finally { await session.endSession(); }
  }
}

export async function readMeasuredPairProfile(ownerId: string, pairId: string): Promise<MeasuredPairProfileDTO> {
  await connectToDatabase();
  const guard = await requirePairMember(pairId, ownerId);
  if (!guard.ok) throw new DomainError({ code: 'NOT_FOUND', status: guard.response.status, message: 'Контекст пары недоступен.' });
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const pair = await Pair.exists({ _id: pairId, members: ownerId, status: { $in: ['active', 'paused'] } }).session(session);
      if (!pair) throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'Контекст пары недоступен.' });
      return materializeMeasuredPairProfile(pairId, session);
    });
    if (!result) throw new Error('PAIR_MEASUREMENT_TRANSACTION_FAILED');
    return result;
  } finally { await session.endSession(); }
}
