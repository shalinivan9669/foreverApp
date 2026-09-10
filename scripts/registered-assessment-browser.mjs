/** Real browser, production Next and the existing owned local acceptance fixture. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); assert.ok(at > 2); return [value.slice(2, at), value.slice(at + 1)]; }));
const origin = args.origin ?? 'http://vmeste-a.localhost:3136';
const login = args.login ?? 'http://vmeste-a.localhost:3137';
assert.equal(new URL(origin).hostname, 'vmeste-a.localhost');
assert.equal(new URL(login).hostname, 'vmeste-a.localhost');
assert.ok(args.module && isAbsolute(args.module), 'Use an explicit external Playwright module');
assert.ok(args.output && isAbsolute(args.output), 'Use an explicit external evidence directory');
assert.ok(args.channel === undefined || ['chrome', 'msedge'].includes(args.channel), 'Optional browser channel must be chrome or msedge');
const out = resolve(args.output); await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url), { chromium } = require(args.module);
const browser = await chromium.launch({ headless: true, ...(args.channel ? { channel: args.channel } : {}) });
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' });
const page = await context.newPage(); page.setDefaultTimeout(20000);
const results = [], pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.name));
page.on('dialog', dialog => dialog.accept());
const read = async path => page.evaluate(async url => { const response = await fetch(url, { cache: 'no-store' }); const body = await response.json(); return { status: response.status, data: body.data }; }, path);
const passed = name => { results.push({ name, status: 'PASSED' }); process.stdout.write(`${JSON.stringify(results.at(-1))}\n`); };
const waitHub = async () => page.getByRole('radio', { name: /^Для себя(?:\s|$)/ }).waitFor();
const visibleStages = async () => {
  const mobile = page.locator('.app-assessment-form-mobile-stages');
  if (await mobile.isVisible()) {
    if (!await mobile.evaluate(node => node.open)) await mobile.locator(':scope > summary').click();
    return mobile.getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
  }
  return page.locator('.app-assessment-form-desktop-stages').getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
};
const waitSavedCount = async count => {
  const mobile = page.locator('.app-assessment-form-mobile-stages');
  if (await mobile.isVisible()) {
    await mobile.locator(':scope > summary').getByText(`Сохранено ${count} из 4 · открыть все этапы`, { exact: true }).waitFor();
  } else {
    await page.locator('.app-assessment-form-desktop-stages').getByText(`Сохранено: ${count} из 4 доступных этапов.`, { exact: true }).waitFor();
  }
};
const responsiveScreenshots = async name => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 760 : 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name} fits the ${width}px viewport`);
    if (width === 320 || width === 1440) await page.screenshot({ path: resolve(out, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 760 });
};
const settings = async () => { const response = await read('/api/assessments/settings'); assert.equal(response.status, 200); return response.data; };
const register = async () => {
  await page.getByRole('checkbox', { name: 'Мне исполнилось 18 лет.', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Принимаю описанные условия использования анкет.', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Разрешаю сохранять мои ответы на эти темы, рассчитывать отдельные личные результаты и обновлять их историю.', exact: true }).check();
  await page.getByRole('button', { name: 'Сохранить выбор и продолжить', exact: true }).click();
  await page.getByRole('link', { name: 'Перейти к анкетам', exact: true }).waitFor();
};
try {
  await page.goto(`${login}/same-origin/a`);
  let state = await settings(); assert.equal(state.mode, 'REGISTERED'); assert.equal(state.admission, 'ELIGIBLE');
  await page.goto(`${origin}/main-menu`);
  await page.locator('[data-today-primary]').waitFor();
  await responsiveScreenshots('registered-main-menu');
  await page.locator('a[href="/questionnaires"]').click();
  await page.getByRole('link', { name: 'Настроить и открыть анкеты', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/questionnaires');
  assert.equal(await page.locator('main').count(), 1);
  const legacy = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Прежние короткие анкеты и результаты' }) });
  assert.equal(await legacy.evaluate(node => node.open), false);
  passed('existing account enters the primary questionnaire route without a participant invitation');
  await page.getByRole('link', { name: 'Настроить и открыть анкеты', exact: true }).click();
  await page.getByRole('heading', { name: 'Один раз перед первой анкетой', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Сохранить выбор и продолжить', exact: true }).isDisabled(), true);
  await register(); state = await settings();
  assert.equal(state.admission, 'ACTIVE'); assert.equal(state.settings.ownerAssessment, true);
  assert.equal(state.settings.discovery, false); assert.equal(state.settings.pairSharing, false);
  passed('self-service setup records the user choices while optional sharing stays off');
  await page.getByRole('link', { name: 'Перейти к анкетам', exact: true }).click(); await waitHub();
  const topicsTab = page.getByRole('tab', { name: 'Анкеты', exact: true });
  const practicesTab = page.getByRole('tab', { name: 'Практики', exact: true });
  await practicesTab.click();
  const practiceGoal = page.getByLabel('Какую собственную цель вы выбираете', { exact: true });
  await practiceGoal.fill('Спокойно сформулировать свою просьбу');
  await practicesTab.press('ArrowLeft');
  assert.equal(await page.getByRole('tab', { name: 'Мои результаты', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('tabpanel').count(), 1, 'only the selected panel is accessible');
  await practicesTab.click();
  assert.equal(await practiceGoal.inputValue(), 'Спокойно сформулировать свою просьбу', 'local practice input survives tab switches');
  await practiceGoal.fill('');
  await topicsTab.click();
  passed('catalogue tabs support keyboard navigation and preserve local input');
  assert.ok(await page.locator('a[href^="/assessments/forms/"]').count() >= 9);
  assert.equal(await page.getByRole('checkbox', { name: 'Мне исполнилось 18 лет.', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: resolve(out, 'registered-questionnaires-320.png'), fullPage: true });
  passed('all registered forms are visible at 320px and conditions are not asked again');
  await page.locator('a[href="/assessments/forms/com-s02-knowledge-beta"]').click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.locator('.app-assessment-form-mobile-stages').waitFor();
  for (let index = 0; index < 4; index++) {
    const progress = await visibleStages();
    await progress.getByRole('button').nth(index).click();
    await page.getByRole('group', { name: 'Выберите вариант', exact: true }).getByRole('radio').first().check();
    if (index === 0) await responsiveScreenshots('registered-form-selected');
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await waitSavedCount(index + 1);
    if (index === 0) { await page.reload(); await page.locator('.app-assessment-form-mobile-stages').waitFor(); await waitSavedCount(1); passed('a saved first answer survives browser reload'); }
  }
  const reviewStages = await visibleStages();
  await reviewStages.getByRole('button', { name: 'Проверить и завершить', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить и обновить личный результат', exact: true }).click();
  await page.getByRole('button', { name: 'Исправить это основание', exact: true }).waitFor();
  const run = await read('/api/assessments/runs?publicationId=com-s02-knowledge-beta');
  assert.equal(run.status, 200); assert.equal(run.data.status, 'FINALIZED'); assert.equal(run.data.answers.length, 4);
  const skill = run.data.profile.snapshot.skills.find(value => value.skillId === 'COM.S02');
  assert.equal(skill.D.status, 'UNKNOWN'); assert.equal(skill.A.status, 'UNKNOWN');
  passed('four-question form completes through real HTTP and keeps task/application tracks separate');
  await page.goto(`${origin}/profile`);
  await page.getByRole('link', { name: 'Пройти анкеты и посмотреть навыки', exact: true }).click(); await waitHub();
  assert.equal(new URL(page.url()).pathname, '/questionnaires');
  await page.goto(`${origin}/assessments/start`);
  await page.getByRole('link', { name: 'Перейти к анкетам', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Мне исполнилось 18 лет.', exact: true }).count(), 0);
  passed('profile uses the same main route and an active account is not asked to reaccept conditions');
  await page.goto(`${login}/same-origin/b`); state = await settings(); assert.equal(state.admission, 'ELIGIBLE');
  await page.goto(`${origin}/assessments/start`); await register();
  const other = await read('/api/assessments/runs?publicationId=com-s02-knowledge-beta');
  assert.equal(other.status, 200); assert.equal(other.data.status, 'NEW'); assert.equal(other.data.answers.length, 0);
  passed('a second existing account independently joins without invitations and sees no first account answers');
  assert.deepEqual(pageErrors, []); passed('browser raised no uncaught page errors');
  await writeFile(resolve(out, 'registered-browser-report.json'), JSON.stringify({ status: 'PASSED', scope: 'CHROMIUM_PRODUCTION_NEXT_HTTP_OWNED_MONGODB', playwright: require(resolve(args.module, 'package.json')).version, browser: { channel: args.channel ?? 'chromium', version: browser.version() }, results }, null, 2));
} catch (error) {
  await page.screenshot({ path: resolve(out, 'registered-browser-failure.png'), fullPage: true }).catch(() => undefined);
  await writeFile(resolve(out, 'registered-browser-report.json'), JSON.stringify({ status: 'FAILED', results, error: error.message }, null, 2));
  throw error;
} finally { await browser.close(); }
