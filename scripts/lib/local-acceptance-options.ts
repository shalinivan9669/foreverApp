import { isAbsolute, relative, resolve, sep } from 'node:path';

export type LocalAcceptanceOptions = {
  mode: 'integration' | 'browser';
  mongod: string;
  mongoPort: number;
  appPort: number;
  partnerAppPort: number;
  loginPort: number;
};

export const parseLocalAcceptanceOptions = (
  args: string[],
  environment: Readonly<Record<string, string | undefined>>,
): LocalAcceptanceOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    const value = separator < 0 ? args[++index] : argument.slice(separator + 1);
    if (!['--mode', '--mongod', '--mongo-port', '--app-port', '--partner-app-port', '--login-port'].includes(name)
      || !value || value.startsWith('--') || values.has(name)) {
      throw new Error('LOCAL_ACCEPTANCE_INVALID_ARGUMENT');
    }
    values.set(name, value);
  }
  const mode = values.get('--mode') ?? 'integration';
  if (mode !== 'integration' && mode !== 'browser') throw new Error('LOCAL_ACCEPTANCE_INVALID_MODE');
  const mongod = values.get('--mongod') ?? environment.LOCAL_ACCEPTANCE_MONGOD;
  if (!mongod || !isAbsolute(mongod)) throw new Error('LOCAL_ACCEPTANCE_ABSOLUTE_MONGOD_PATH_REQUIRED');
  const port = (name: string, fallback: number): number => {
    const raw = values.get(name) ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1024 || value > 65535) {
      throw new Error('LOCAL_ACCEPTANCE_INVALID_PORT');
    }
    return value;
  };
  const options: LocalAcceptanceOptions = {
    mode, mongod: resolve(mongod), mongoPort: port('--mongo-port', 27039),
    appPort: port('--app-port', 3106), partnerAppPort: port('--partner-app-port', 3108), loginPort: port('--login-port', 3107),
  };
  if (new Set([options.mongoPort, options.appPort, options.partnerAppPort, options.loginPort]).size !== 4) {
    throw new Error('LOCAL_ACCEPTANCE_PORTS_MUST_DIFFER');
  }
  return options;
};

// Carry only operating-system/runtime essentials into children. In particular,
// no application credentials, NODE_OPTIONS, proxy credentials or .env loaders.
export const localAcceptanceEnvironment = (environment: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> => {
  const allowed = new Set(['systemroot', 'windir', 'comspec', 'path', 'pathext', 'temp', 'tmp', 'tmpdir', 'home', 'userprofile', 'localappdata', 'appdata']);
  return Object.fromEntries(Object.entries(environment).filter(([key]) => allowed.has(key.toLowerCase())));
};

export const assertOwnedLocalAcceptanceDirectory = (directory: string, parent: string): void => {
  const child = relative(resolve(parent), resolve(directory));
  if (!child || isAbsolute(child) || child.startsWith(`..${sep}`) || child === '..'
    || child.includes(sep) || !/^vmeste-local-acceptance-[a-zA-Z0-9]+$/.test(child)) {
    throw new Error('LOCAL_ACCEPTANCE_UNSAFE_CLEANUP_PATH');
  }
};

export const localAcceptanceActor = (
  host: string | undefined,
  path: string | undefined,
  port: number,
): 'a' | 'b' | null => {
  if (host === `vmeste-a.localhost:${port}` && path === '/a') return 'a';
  if (host === `vmeste-b.localhost:${port}` && path === '/b') return 'b';
  return null;
};
