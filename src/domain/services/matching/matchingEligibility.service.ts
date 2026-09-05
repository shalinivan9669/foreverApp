import type { ClientSession } from "mongoose";
import { DomainError } from "@/domain/errors";
import { User } from "@/models/User";

export type MatchingPerson = { id: string; entryCohort?: "SOLO" | "EXISTING_PARTNER"; personal: { age?: number; gender?: "male" | "female" } };
export type MatchingGenderPreference = { soughtGender?: "ANY" | "male" | "female" };
export async function loadMatchingPeople(userIds: readonly string[], session?: ClientSession): Promise<Map<string, MatchingPerson>> {
  const rows = await User.find({ id: { $in: [...userIds] } }).select({ id: 1, entryCohort: 1, "personal.age": 1, "personal.gender": 1 }).session(session ?? null).lean<MatchingPerson[]>();
  return new Map(rows.map((row) => [row.id, row]));
}
export function isMatchingPersonEligible(person?: MatchingPerson): boolean {
  return Boolean(person && person.entryCohort !== "EXISTING_PARTNER" && (person.personal.age ?? 0) >= 18);
}
export function mutualMatchingGenderEligible(left?: MatchingPerson, right?: MatchingPerson, leftPreferences?: MatchingGenderPreference, rightPreferences?: MatchingGenderPreference): boolean {
  const accepts = (preference: MatchingGenderPreference | undefined, person: MatchingPerson | undefined) => !preference?.soughtGender || preference.soughtGender === "ANY" || preference.soughtGender === person?.personal.gender;
  return isMatchingPersonEligible(left) && isMatchingPersonEligible(right) && accepts(leftPreferences, right) && accepts(rightPreferences, left);
}
export async function assertMatchingSolo(userIds: readonly string[], session?: ClientSession): Promise<void> {
  const people = await loadMatchingPeople(userIds, session);
  if (userIds.some((id) => !isMatchingPersonEligible(people.get(id)))) throw new DomainError({ code: "MATCHING_SOLO_REQUIRED", status: 409, message: "Поиск доступен совершеннолетним в режиме личного развития и поиска. Выберите маршрут в профиле." });
}
