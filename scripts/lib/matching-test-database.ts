export type MatchingTestDatabaseTarget = {
  uri: string;
  databaseName: string;
  protocol: 'mongodb:' | 'mongodb+srv:';
};

const FORBIDDEN_DATABASE_NAMES = new Set([
  'admin',
  'config',
  'local',
  'production',
  'prod',
  'foreverapp',
  'forever_app',
]);

export class MatchingTestDatabaseGuardError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'MatchingTestDatabaseGuardError';
  }
}

export const parseMatchingTestDatabaseUri = (
  value: string | undefined
): MatchingTestDatabaseTarget => {
  const uri = value?.trim();
  if (!uri) throw new MatchingTestDatabaseGuardError('MATCHING_TEST_MONGODB_URI_REQUIRED');

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new MatchingTestDatabaseGuardError('MATCHING_TEST_MONGODB_URI_INVALID');
  }
  if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
    throw new MatchingTestDatabaseGuardError('MATCHING_TEST_MONGODB_URI_INVALID');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  const normalizedName = databaseName.toLowerCase();
  if (
    !databaseName ||
    !normalizedName.endsWith('_test') ||
    FORBIDDEN_DATABASE_NAMES.has(normalizedName) ||
    /(^|[_-])(prod|production)([_-]|$)/i.test(databaseName)
  ) {
    throw new MatchingTestDatabaseGuardError('MATCHING_TEST_DATABASE_GUARD_FAILED');
  }
  if (parsed.protocol === 'mongodb+srv:' && parsed.searchParams.has('directConnection')) {
    throw new MatchingTestDatabaseGuardError('MATCHING_TEST_MONGODB_URI_INVALID');
  }
  return {
    uri,
    databaseName,
    protocol: parsed.protocol,
  };
};

export const requireMatchingTestDatabaseTarget = (): MatchingTestDatabaseTarget =>
  parseMatchingTestDatabaseUri(process.env.MATCHING_TEST_MONGODB_URI);
