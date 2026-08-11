import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const routePaths = [
  'src/app/api/activity-templates/route.ts',
  'src/app/api/questionnaires/route.ts',
  'src/app/api/questionnaires/[id]/route.ts',
  'src/app/api/pairs/me/route.ts',
  'src/app/api/pairs/status/route.ts',
  'src/app/api/users/me/route.ts',
  'src/app/api/users/[id]/route.ts',
  'src/app/api/users/me/profile-summary/route.ts',
  'src/app/api/entitlements/grant/route.ts',
] as const;

const forbiddenImports = [
  /(^|\/)models(\/|$)/,
  /(^|\/)mongodb$/,
  /(^|\/)dto(\/|$)/,
] as const;

for (const routePath of routePaths) {
  const absolutePath = join(process.cwd(), routePath);
  const source = ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const imports = source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);

  for (const specifier of imports) {
    assert.equal(
      forbiddenImports.some((pattern) => pattern.test(specifier)),
      false,
      `${routePath} directly imports persistence or DTO mapping: ${specifier}`
    );
  }

  assert.ok(
    imports.some((specifier) => specifier.includes('/domain/services/')),
    `${routePath} must delegate stateful reads or writes to a domain service`
  );
}

console.log('thin API routes selfcheck passed');
