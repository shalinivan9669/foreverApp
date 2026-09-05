import { execSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

type Severity = 'error' | 'warning' | 'info';

const RULE_IDS = [
  'auth.no-client-userid-subject',
  'auth.missing-session-guard',
  'api.no-raw-mongoose-return',
  'security.no-sensitive-logging',
  'architecture.no-client-domain-import',
  'ui.no-direct-fetch',
  'route.max-120-lines',
  'docs.stale-active-marker',
  'prod.todo-in-production-path',
  'docs.context-budget-hint',
  'allowlist.entry-used',
] as const;

type RuleId = (typeof RULE_IDS)[number];

type Finding = {
  severity: Severity;
  rule: RuleId;
  file: string;
  line: number;
  message: string;
};

type AllowlistEntry = {
  rule: RuleId;
  file: string;
  reason: string;
  expires?: string;
};

type AllowlistFile = {
  version: number;
  entries: AllowlistEntry[];
};

type CliOptions = {
  compact: boolean;
  json: boolean;
  changedOnly: boolean;
  rules: RuleId[];
};

type CheckContext = {
  root: string;
  changedOnly: boolean;
  changedFiles: Set<string>;
};

type CheckRule = {
  id: RuleId;
  severity: Severity;
  run: (context: CheckContext) => Finding[];
};

const GENERATED_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'coverage',
  'dist',
  'build',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const DOC_EXTENSIONS = new Set(['.md']);

const isRuleId = (value: string): value is RuleId =>
  (RULE_IDS as readonly string[]).includes(value);

const toRepoPath = (root: string, filePath: string): string =>
  path.relative(root, filePath).replace(/\\/g, '/');

const normalizePath = (filePath: string): string =>
  filePath.replace(/\\/g, '/').replace(/^\.\//, '');

const readText = (filePath: string): string =>
  readFileSync(filePath, 'utf8');

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const rules: RuleId[] = [];
  let compact = false;
  let json = false;
  let changedOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--compact') {
      compact = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--changed-only') {
      changedOnly = true;
      continue;
    }
    if (arg === '--rule') {
      const next = args[index + 1];
      if (!next || !isRuleId(next)) {
        throw new Error(`Unknown or missing rule: ${next ?? '(missing)'}`);
      }
      rules.push(next);
      index += 1;
    }
  }

  return { compact, json, changedOnly, rules };
};

const walk = (root: string, start: string): string[] => {
  const fullStart = path.join(root, start);
  if (!existsSync(fullStart)) return [];

  const found: string[] = [];
  const visit = (current: string): void => {
    const repoPath = toRepoPath(root, current);
    const base = path.basename(current);
    if (GENERATED_DIRS.has(base) || GENERATED_DIRS.has(repoPath)) return;

    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) {
        visit(path.join(current, entry));
      }
      return;
    }

    found.push(current);
  };

  visit(fullStart);
  return found;
};

const filterChanged = (files: string[], context: CheckContext): string[] => {
  if (!context.changedOnly) return files;
  return files.filter((file) => context.changedFiles.has(toRepoPath(context.root, file)));
};

const sourceFiles = (context: CheckContext, starts: string[]): string[] =>
  filterChanged(
    starts.flatMap((start) => walk(context.root, start)).filter((file) =>
      SOURCE_EXTENSIONS.has(path.extname(file))
    ),
    context
  );

const docFiles = (context: CheckContext, starts: string[]): string[] =>
  filterChanged(
    starts.flatMap((start) => walk(context.root, start)).filter((file) =>
      DOC_EXTENSIONS.has(path.extname(file))
    ),
    context
  );

const routeFiles = (context: CheckContext): string[] =>
  sourceFiles(context, ['src/app/api']).filter((file) => path.basename(file) === 'route.ts');

const changedFiles = (root: string): Set<string> => {
  try {
    const output = execSync('git status --porcelain', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = output
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const rawPath = line.slice(3);
        const renamed = rawPath.includes(' -> ') ? rawPath.split(' -> ').at(-1) : rawPath;
        return normalizePath(renamed ?? rawPath);
      });
    return new Set(files);
  } catch {
    return new Set();
  }
};

const lineFindings = (
  root: string,
  filePath: string,
  rule: RuleId,
  severity: Severity,
  matcher: (line: string) => string | null
): Finding[] => {
  const lines = readText(filePath).split(/\r?\n/);
  const findings: Finding[] = [];
  lines.forEach((line, index) => {
    const message = matcher(line);
    if (!message) return;
    findings.push({
      severity,
      rule,
      file: toRepoPath(root, filePath),
      line: index + 1,
      message,
    });
  });
  return findings;
};

const readAllowlist = (root: string): AllowlistFile => {
  const filePath = path.join(root, '.agent-checks.allowlist.json');
  if (!existsSync(filePath)) return { version: 1, entries: [] };
  return JSON.parse(readText(filePath)) as AllowlistFile;
};

const allowlistActive = (entry: AllowlistEntry, today: Date): boolean => {
  if (!entry.expires) return true;
  const expiry = new Date(`${entry.expires}T23:59:59.999Z`);
  return Number.isFinite(expiry.getTime()) && expiry >= today;
};

const applyAllowlist = (
  findings: Finding[],
  allowlist: AllowlistFile,
  root: string
): Finding[] => {
  const today = new Date();
  const activeEntries = allowlist.entries.filter((entry) => allowlistActive(entry, today));
  const kept: Finding[] = [];
  const used: Finding[] = [];

  for (const finding of findings) {
    const entry = activeEntries.find(
      (candidate) =>
        candidate.rule === finding.rule &&
        normalizePath(candidate.file) === normalizePath(finding.file)
    );
    if (!entry) {
      kept.push(finding);
      continue;
    }
    used.push({
      severity: 'info',
      rule: 'allowlist.entry-used',
      file: finding.file,
      line: finding.line,
      message: `Suppressed ${finding.rule}: ${entry.reason}`,
    });
  }

  return [...kept, ...used].filter((finding) =>
    existsSync(path.join(root, finding.file)) || finding.file === 'docs/CONTEXT_BUDGET.md'
  );
};

const privateMutationWithoutSession = (filePath: string): boolean => {
  const text = readText(filePath);
  const hasMutation = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/.test(text);
  if (!hasMutation) return false;
  if (/requireSession\s*\(/.test(text)) return false;
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const usesCentralMatchingGuard =
    normalizedFilePath.includes('/src/app/api/match/') &&
    /import\s*\{[^}]*\bprepareMatchingRequest\b[^}]*\}\s*from\s*['"][^'"]*_shared['"]/.test(
      text
    ) &&
    /await\s+prepareMatchingRequest\s*\(/.test(text);
  if (usesCentralMatchingGuard) return false;
  const usesCentralEconomyGuard =
    /\/src\/app\/api\/economy\/[^/]+\/route\.ts$/.test(normalizedFilePath) &&
    /import\s*\{[^}]*\brequireEconomyOwner\b[^}]*\}\s*from\s*['"]\.\.\/shared['"]/.test(text) &&
    /await\s+requireEconomyOwner\s*\(\s*req\s*\)/.test(text) &&
    /requireSession\s*\(\s*req\s*\)/.test(readText(path.resolve(path.dirname(filePath), '../shared.ts')));
  if (usesCentralEconomyGuard) return false;
  if (/canGrant\s*\(|ADMIN_HEADER|ENTITLEMENTS_ADMIN_KEY/.test(text)) return false;
  const isVerifiedSandboxWebhook =
    normalizedFilePath.endsWith('/src/app/api/billing/webhooks/sandbox/route.ts') &&
    /import\s*\{[^}]*\bverifySandboxWebhook\b[^}]*\}\s*from\s*['"]@\/lib\/billing\/sandboxWebhook['"]/.test(
      text
    ) &&
    /\bverifySandboxWebhook\s*\(/.test(text);
  if (isVerifiedSandboxWebhook) return false;
  if (filePath.replace(/\\/g, '/').endsWith('/src/app/api/exchange-code/route.ts')) return false;
  return true;
};

const rules: CheckRule[] = [
  {
    id: 'auth.no-client-userid-subject',
    severity: 'error',
    run: (context) =>
      routeFiles(context)
        .filter((file) => /requireSession\s*\(/.test(readText(file)))
        .flatMap((file) =>
          lineFindings(context.root, file, 'auth.no-client-userid-subject', 'error', (line) => {
            const subjectPattern =
              /\b(currentUserId|actorUserId|subjectUserId|userId)\s*[:=]\s*(body|payload|query|params|parsedBody\.data|bodyResult\.data)\.(userId|fromId|actorId)\b/;
            return subjectPattern.test(line)
              ? 'Private endpoint must use requireSession(req).data.userId as subject'
              : null;
          })
        ),
  },
  {
    id: 'auth.missing-session-guard',
    severity: 'error',
    run: (context) =>
      routeFiles(context)
        .filter(privateMutationWithoutSession)
        .map((file) => ({
          severity: 'error',
          rule: 'auth.missing-session-guard',
          file: toRepoPath(context.root, file),
          line: 1,
          message: 'Private mutation route must use requireSession or an explicit documented auth alternative',
        })),
  },
  {
    id: 'api.no-raw-mongoose-return',
    severity: 'error',
    run: (context) =>
      routeFiles(context).flatMap((file) =>
        lineFindings(context.root, file, 'api.no-raw-mongoose-return', 'error', (line) => {
          const rawReturnPattern =
            /return\s+jsonOk\((doc|docs|user|users|pair|pairs|like|likes|activity|activities|subscription)\s*[),]/;
          return rawReturnPattern.test(line)
            ? 'API route should return DTO/view model output, not raw model documents'
            : null;
        })
      ),
  },
  {
    id: 'security.no-sensitive-logging',
    severity: 'error',
    run: (context) =>
      sourceFiles(context, ['src', 'scripts']).flatMap((file) =>
        lineFindings(context.root, file, 'security.no-sensitive-logging', 'error', (line) => {
          const hasConsole = /console\.(log|warn|error)\s*\(/.test(line);
          const hasSensitive =
            /\b(access_token|refresh_token|authorization|cookie|password|secret|raw|body|answers|checkins?)\b/i.test(
              line
            );
          return hasConsole && hasSensitive
            ? 'Do not log tokens, cookies, raw bodies, answers, or secrets'
            : null;
        })
      ),
  },
  {
    id: 'architecture.no-client-domain-import',
    severity: 'error',
    run: (context) =>
      sourceFiles(context, ['src/components', 'src/features', 'src/client']).flatMap((file) =>
        lineFindings(context.root, file, 'architecture.no-client-domain-import', 'error', (line) => {
          const badImport = /from\s+['"]@\/(models|domain|lib\/auth)\b/.test(line);
          return badImport
            ? 'Client/UI code must not import models, domain services, or server auth'
            : null;
        })
      ),
  },
  {
    id: 'ui.no-direct-fetch',
    severity: 'warning',
    run: (context) =>
      sourceFiles(context, ['src/app', 'src/features', 'src/components'])
        .filter((file) => !toRepoPath(context.root, file).startsWith('src/app/api/'))
        .flatMap((file) =>
          lineFindings(context.root, file, 'ui.no-direct-fetch', 'warning', (line) =>
            /\bfetch\s*\(/.test(line)
              ? 'Prefer typed src/client/api clients over direct UI fetch'
              : null
          )
        ),
  },
  {
    id: 'route.max-120-lines',
    severity: 'warning',
    run: (context) =>
      routeFiles(context)
        .map((file) => ({
          file,
          lines: readText(file).split(/\r?\n/).length,
        }))
        .filter((item) => item.lines > 120)
        .map((item) => ({
          severity: 'warning',
          rule: 'route.max-120-lines',
          file: toRepoPath(context.root, item.file),
          line: 1,
          message: `Route handler is ${item.lines} lines; consider moving logic to services/DTO helpers`,
        })),
  },
  {
    id: 'docs.stale-active-marker',
    severity: 'warning',
    run: (context) => {
      const files = docFiles(context, ['docs']).filter((file) => {
        const repoPath = toRepoPath(context.root, file);
        return ['docs/INDEX.md', 'docs/DOCS_STATUS.md'].includes(repoPath);
      });
      return files.flatMap((file) =>
        lineFindings(context.root, file, 'docs.stale-active-marker', 'warning', (line) => {
          const repoPath = toRepoPath(context.root, file);
          const marksAsActiveAsIs = /as-is\.md`\s*\|\s*active/i.test(line);
          const indexLinksAsIs =
            repoPath === 'docs/INDEX.md' && /docs\/activities\/.*as-is\.md/.test(line);
          return marksAsActiveAsIs || indexLinksAsIs
            ? 'Stale as-is activity docs must not be active navigation sources'
            : null;
        })
      );
    },
  },
  {
    id: 'prod.todo-in-production-path',
    severity: 'warning',
    run: (context) =>
      sourceFiles(context, ['src']).flatMap((file) =>
        lineFindings(context.root, file, 'prod.todo-in-production-path', 'warning', (line) =>
          /\bTODO\b/.test(line) ? 'TODO in production path should be resolved or documented' : null
        )
      ),
  },
  {
    id: 'docs.context-budget-hint',
    severity: 'info',
    run: () => [
      {
        severity: 'info',
        rule: 'docs.context-budget-hint',
        file: 'docs/CONTEXT_BUDGET.md',
        line: 1,
        message: 'Use task packs and stay within context budget before expanding scope',
      },
    ],
  },
  {
    id: 'allowlist.entry-used',
    severity: 'info',
    run: () => [],
  },
];

const summarize = (findings: Finding[]) => ({
  errors: findings.filter((finding) => finding.severity === 'error').length,
  warnings: findings.filter((finding) => finding.severity === 'warning').length,
  info: findings.filter((finding) => finding.severity === 'info').length,
});

const printJson = (findings: Finding[]): void => {
  const summary = summarize(findings);
  process.stdout.write(
    `${JSON.stringify({ ok: summary.errors === 0, summary, findings }, null, 2)}\n`
  );
};

const printCompact = (findings: Finding[]): void => {
  const summary = summarize(findings);
  process.stdout.write(
    `agent-checks: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info\n`
  );
  for (const finding of findings) {
    process.stdout.write(
      `${finding.severity.toUpperCase()} ${finding.rule} ${finding.file}:${finding.line} ${finding.message}\n`
    );
  }
};

const printDefault = (findings: Finding[]): void => {
  if (findings.length === 0) {
    process.stdout.write('agent-checks: no findings\n');
    return;
  }
  printCompact(findings);
};

const main = (): void => {
  const options = parseArgs();
  const root = process.cwd();
  const selected = options.rules.length
    ? rules.filter((rule) => options.rules.includes(rule.id))
    : rules;
  const context: CheckContext = {
    root,
    changedOnly: options.changedOnly,
    changedFiles: changedFiles(root),
  };

  const rawFindings = selected.flatMap((rule) => rule.run(context));
  const findings = applyAllowlist(rawFindings, readAllowlist(root), root);

  if (options.json) {
    printJson(findings);
  } else if (options.compact) {
    printCompact(findings);
  } else {
    printDefault(findings);
  }

  const summary = summarize(findings);
  process.exitCode = summary.errors > 0 ? 1 : 0;
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'agent-checks failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
