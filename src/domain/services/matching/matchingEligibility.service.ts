import type { ClientSession } from "mongoose";
import { DomainError } from "@/domain/errors";
import { User } from "@/models/User";
import { Pair } from "@/models/Pair";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { getMatchingEligibility } from "@/lib/contracts/matchingEligibility";

export type MatchingPerson = { id: string; entryCohort?: "SOLO" | "EXISTING_PARTNER"; hasPair?: boolean; personal?: { age?: number; gender?: "male" | "female"; relationshipStatus?: "seeking" | "in_relationship" } };
export type MatchingGenderPreference = { soughtGender?: "ANY" | "male" | "female" };
export async function loadMatchingPeople(userIds: readonly string[], session?: ClientSession): Promise<Map<string, MatchingPerson>> {
  const ids = [...new Set(userIds)];
  const rows = await User.find({ id: { $in: ids } }).select({ id: 1, entryCohort: 1, "personal.age": 1, "personal.gender": 1, "personal.relationshipStatus": 1 }).session(session ?? null).lean<MatchingPerson[]>();
  // Both sources fail closed, including an incomplete historical claim projection.
  // Keep session reads sequential: MongoDB transactions do not support parallel operations.
  const claims = await PairMembershipClaim.find({ userId: { $in: ids } }).select({ userId: 1 }).session(session ?? null).lean<Array<{ userId: string }>>();
  const pairs = await Pair.find({ members: { $in: ids }, status: { $in: ["active", "paused"] } }).select({ members: 1 }).session(session ?? null).lean<Array<{ members: string[] }>>();
  const occupied = new Set([...claims.map((claim) => claim.userId), ...pairs.flatMap((pair) => pair.members)]);
  return new Map(rows.map((row) => [row.id, { ...row, hasPair: occupied.has(row.id) }]));
}
export function isMatchingPersonEligible(person?: MatchingPerson): boolean {
  return Boolean(person && getMatchingEligibility({ entryCohort: person.entryCohort, relationshipStatus: person.personal?.relationshipStatus, age: person.personal?.age, hasPair: person.hasPair }) === "ELIGIBLE");
}
export function mutualMatchingGenderEligible(left?: MatchingPerson, right?: MatchingPerson, leftPreferences?: MatchingGenderPreference, rightPreferences?: MatchingGenderPreference): boolean {
  const accepts = (preference: MatchingGenderPreference | undefined, person: MatchingPerson | undefined) => !preference?.soughtGender || preference.soughtGender === "ANY" || preference.soughtGender === person?.personal?.gender;
  return isMatchingPersonEligible(left) && isMatchingPersonEligible(right) && accepts(leftPreferences, right) && accepts(rightPreferences, left);
}
export async function assertMatchingSolo(userIds: readonly string[], session?: ClientSession): Promise<void> {
  const people = await loadMatchingPeople(userIds, session);
  if (userIds.some((id) => !isMatchingPersonEligible(people.get(id)))) throw new DomainError({ code: "MATCHING_SOLO_REQUIRED", status: 409, message: "Поиск доступен совершеннолетним в режиме личного развития и поиска. Выберите маршрут в профиле." });
}
