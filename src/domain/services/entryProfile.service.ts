import { DomainError } from '@/domain/errors';
import { SEARCH_CITIES, CITY_CATALOG_VERSION, coarseCoordinates } from '@/domain/model/entry/cityCatalog';
import { ensurePublicPairingId } from '@/domain/services/userPublicIdentity.service';
import { usersService } from '@/domain/services/users.service';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';

export type EntryProfileInput = {
  cohort: 'SOLO' | 'EXISTING_PARTNER';
  age: number;
  gender: 'male' | 'female';
  city: string;
  locationMode: 'CITY_CATALOG' | 'DEVICE' | 'NONE' | 'KEEP';
  searchCityId?: string;
  coordinates?: [number, number];
};

export const resolveEntryLocation = (input: EntryProfileInput): {
  location?: UserType['location'] | null;
  locationSource?: UserType['locationSource'];
} => {
  if (input.locationMode === 'KEEP') return {};
  if (input.locationMode === 'NONE') return { location: null, locationSource: 'NONE' };
  const city = SEARCH_CITIES.find((item) => item.id === input.searchCityId);
  const coordinates = input.locationMode === 'CITY_CATALOG' ? city?.coordinates : input.coordinates;
  if (!coordinates || coordinates.length !== 2 || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1]) || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90) {
    throw new DomainError({ code: 'VALIDATION_ERROR', status: 400, message: 'Choose a search city or allow an approximate location' });
  }
  return { location: { type: 'Point', coordinates: coarseCoordinates(coordinates) }, locationSource: input.locationMode };
};

export const entryProfileService = {
  async get(currentUserId: string) {
    const publicId = await ensurePublicPairingId(currentUserId);
    const [user, activePair, onboarding] = await Promise.all([
      usersService.getCurrentUserProfile(currentUserId),
      Pair.exists({ members: currentUserId, status: { $in: ['active', 'paused'] } }),
      MvpOnboardingSession.exists({ userId: currentUserId, status: 'completed' }),
    ]);
    if (!user) throw new DomainError({ code: 'USER_NOT_FOUND', status: 404, message: 'User not found' });
    return { user: { ...user, publicId }, hasPair: Boolean(activePair), onboardingCompleted: Boolean(onboarding), cityCatalogVersion: CITY_CATALOG_VERSION, searchCities: SEARCH_CITIES };
  },

  async save(input: { currentUserId: string; profile: EntryProfileInput; auditRequest?: AuditRequestContext }) {
    await ensurePublicPairingId(input.currentUserId);
    const hasPair = Boolean(await Pair.exists({ members: input.currentUserId, status: { $in: ['active', 'paused'] } }));
    if (hasPair && input.profile.cohort === 'SOLO') {
      throw new DomainError({ code: 'PAIR_ALREADY_ACTIVE', status: 409, message: 'An active pair already exists' });
    }
    if (!Number.isInteger(input.profile.age) || input.profile.age < 18 || input.profile.age > 120 || !input.profile.city.trim()) {
      throw new DomainError({ code: 'VALIDATION_ERROR', status: 400, message: 'Adult age and city are required' });
    }
    const existing = await User.findOne({ id: input.currentUserId }).select({ entryCompletedAt: 1 }).lean<{ entryCompletedAt?: Date } | null>();
    await usersService.updateCurrentUserProfile({
      currentUserId: input.currentUserId,
      payload: {
        personal: {
          gender: input.profile.gender,
          age: input.profile.age,
          city: input.profile.city.trim(),
          relationshipStatus: hasPair ? 'in_relationship' : 'seeking',
        },
        entryCohort: input.profile.cohort,
        entryCompletedAt: existing?.entryCompletedAt ?? new Date(),
        ...resolveEntryLocation(input.profile),
      },
      auditRequest: input.auditRequest,
    });
    return this.get(input.currentUserId);
  },
};
