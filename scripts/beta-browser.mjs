/** Real Chromium + production Next + owned MongoDB. No deployed authentication bypass. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { resolve, isAbsolute, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { runBetaProfileBrowser } from './lib/beta-profile-browser.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); assert.ok(i > 2); return [arg.slice(2, i), arg.slice(i + 1)]; }));
const origin = args.origin ?? 'http://vmeste-a.localhost:3106';
const login = args.login ?? 'http://vmeste-a.localhost:3107';
assert.equal(new URL(origin).hostname, 'vmeste-a.localhost'); assert.equal(new URL(login).hostname, 'vmeste-a.localhost');
const modulePath = args.module ?? process.env.BETA_PLAYWRIGHT_MODULE;
assert.ok(modulePath && isAbsolute(modulePath), 'Explicit external Playwright module path is required');
const out = resolve(args.output ?? process.env.BETA_EVIDENCE_DIR ?? '../foreverApp-beta-browser-evidence');
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(modulePath);
const runtimeVersion = require(resolve(modulePath, 'package.json')).version;
const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' });
const traceViolations = new Set();
const privateMarker = /SYNTHETIC_(?:A_PRIVATE_DRAFT|B_SUPPORT|PRIVATE_PAIR_NOTE|BFCACHE_PRIVATE)/;
const watch = target => {
  const watchPage = current => { current.on('console', message => { if (privateMarker.test(message.text())) traceViolations.add('private-console'); }); current.on('pageerror', error => { if (privateMarker.test(error.message)) traceViolations.add('private-error'); }); };
  target.pages().forEach(watchPage); target.on('page', watchPage);
  target.on('request', request => {
    const url = request.url(); if (privateMarker.test(decodeURIComponent(url))) traceViolations.add('private-url');
    if (/https?:\/\/[^/]*(?:hotjar|fullstory|logrocket)/i.test(url)) traceViolations.add('unscoped-session-replay');
    if (/[?&](?:session_token|access_token|answers|note|message)=/i.test(url)) traceViolations.add('private-query-field');
  });
};
watch(context);
const page = await context.newPage(); page.setDefaultTimeout(12000);
page.on('dialog', dialog => dialog.accept());
const records = [];
const check = async (id, name, work) => { await work(); records.push({ id, name, status: 'PASSED', layer: 'CHROMIUM_PRODUCTION_NEXT_HTTP_MONGODB' }); process.stdout.write(`${JSON.stringify(records.at(-1))}\n`); };
const settled = async target => { await target.getByRole('radio', { name: 'Для себя', exact: true }).waitFor({ state: 'visible' }); };
const browserJson = (target, path) => target.evaluate(async url => { const response = await fetch(url, { cache: 'no-store' }); return { status: response.status, body: await response.json() }; }, path);
const readRun = async (target, publicationId) => { const response = await browserJson(target, `/api/assessments/runs?publicationId=${publicationId}`); assert.equal(response.status, 200); return response.body.data; };
const fetchRoute = route => route.fetch({ url: route.request().url().replace('vmeste-a.localhost', '127.0.0.1'), headers: { ...route.request().headers(), host: new URL(origin).host } });
const active = async () => {
  await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => [...document.querySelectorAll('input[type="radio"]')].some(input => !input.matches(':disabled')));
};
let stage = 'bootstrap';
try {
  await page.goto(`${login}/same-origin/a`); await settled(page);
  await check('browser-product-navigation', 'existing profile links to beta topics and central settings link to private help without completed forms', async () => {
    await page.goto(`${origin}/profile`); await page.getByRole('link', { name: 'Навыки и анкеты', exact: true }).click(); await settled(page);
    await page.getByRole('navigation', { name: 'Возможности беты' }).getByRole('link', { name: 'Мои данные', exact: true }).click();
    await page.getByRole('link', { name: 'Личная помощь и безопасный выход', exact: true }).click();
    await page.getByRole('heading', { name: 'Как работает Forever', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Данные и аккаунт', exact: true }).isVisible(), true);
    await page.goto(`${origin}/assessments`); await settled(page);
  });
  await check('browser-mobile', '320px real browser has accessible goal and no horizontal page overflow', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: resolve(out, 'beta-hub-320.png'), fullPage: true });
    await page.getByRole('radio', { name: 'Для себя', exact: true }).press('Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY');
  });
  await check('browser-reduced-motion', 'prefers-reduced-motion reduce in native media engine disables actual animation', async () => {
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('main,main *')].every(node => getComputedStyle(node).animationName === 'none')), true);
  });
  await check('browser-native-zoom', 'native Chrome tabs zoom at 200 and 400 percent reflows hub pair and direct controls without text overflow', async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'vmeste-beta-zoom-'));
    const extension = resolve(temporary, 'extension'); await mkdir(extension);
    await writeFile(resolve(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Owned local zoom acceptance', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
    await writeFile(resolve(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
    let zoomContext;
    try {
      zoomContext = await chromium.launchPersistentContext(resolve(temporary, 'profile'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], viewport: { width: 1280, height: 900 } });
      const worker = zoomContext.serviceWorkers()[0] ?? await zoomContext.waitForEvent('serviceworker');
      const zoomPage = await zoomContext.newPage(); zoomPage.setDefaultTimeout(12000);
      await zoomPage.goto(`${login}/same-origin/a`); await settled(zoomPage);
      for (const factor of [2, 4]) {
        await worker.evaluate(async ({ origin: ownOrigin, factor: zoom }) => {
          const tabs = await chrome.tabs.query({}); const own = tabs.find(tab => tab.url?.startsWith(ownOrigin));
          if (!own) throw new Error('OWN_TAB_MISSING'); await chrome.tabs.setZoom(own.id, zoom);
        }, { origin, factor });
        await zoomPage.waitForFunction(width => innerWidth === width, 1280 / factor);
        for (const path of ['/assessments', '/assessments/pair', '/assessments/conditions']) {
          await zoomPage.goto(`${origin}${path}`);
          if (path.endsWith('/pair')) await zoomPage.getByLabel('Моя личная заметка', { exact: true }).waitFor();
          else if (path.endsWith('/conditions')) await zoomPage.getByRole('button', { name: 'Сохранить мои условия', exact: true }).waitFor();
          else await settled(zoomPage);
          assert.equal(await zoomPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
      }
      // Playwright fullPage uses CSS dimensions and clips native Chrome zoom; keep the real physical viewport.
      await zoomPage.screenshot({ path: resolve(out, 'beta-conditions-native-400.png') });
    } finally {
      await zoomContext?.close();
      const canonical = await realpath(temporary), base = await realpath(tmpdir());
      const owned = relative(base, canonical); assert.ok(owned.startsWith('vmeste-beta-zoom-') && !owned.includes(sep));
      await rm(canonical, { recursive: true });
    }
    await page.bringToFront(); await settled(page);
  });
  stage = 'pair';
  await page.getByRole('link', { name: 'Договорённости пары', exact: true }).click();
  await page.getByRole('heading', { name: 'Текущие заявленные условия', exact: true }).waitFor();
  const actualBefore = (await browserJson(page, '/api/assessments/portfolio')).body.data.profile;
  await check('browser-current-conditional', 'selected hypothetical criterion plus schedule is distinct from current and does not change owner actual', async () => {
    const selection = page.getByRole('group', { name: 'Опубликованные варианты для текущего контекста' });
    const count = await selection.getByRole('checkbox').count(); assert.equal(count, 2);
    for (let i = 0; i < count; i++) await selection.getByRole('checkbox').nth(i).check();
    await page.getByRole('button', { name: 'Рассчитать выбранный условный набор', exact: true }).click();
    await page.getByRole('region', { name: 'Условный результат пары' }).getByText('Условия поддержаны известными данными', { exact: true }).waitFor();
    await page.getByText('В проверенном наборе нет целевого плана', { exact: true }).waitFor();
    assert.deepEqual((await browserJson(page, '/api/assessments/portfolio')).body.data.profile, actualBefore);
  });
  const peerContext = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' }); watch(peerContext); const peer = await peerContext.newPage();
  await peer.goto(`${login}/same-origin/b`); await settled(peer); await peer.getByRole('link', { name: 'Договорённости пары', exact: true }).click();
  await peer.getByLabel('Моя личная заметка', { exact: true }).waitFor();
  const sharedView = target => target.locator('article').filter({ hasText: 'Общий вид A:' }).allTextContents();
  const closedBefore = await sharedView(peer);
  const periodSelector = page.getByRole('combobox', { name: 'Выберите прошедшее или начавшееся повторение', exact: true });
  const reportPeriod = await periodSelector.locator('option').nth(1).getAttribute('value'); assert.ok(reportPeriod);
  await periodSelector.selectOption(reportPeriod);
  await check('browser-private-report', 'closed report and absent report have identical peer rendering and own note stays private', async () => {
    await page.getByRole('radio', { name: 'Мне нужно изменить договорённость', exact: true }).check();
    await page.getByRole('button', { name: 'Сохранить мой отчёт', exact: true }).click(); await page.getByText('Показан ваш сохранённый отчёт.', { exact: true }).waitFor();
    await page.getByLabel('Моя личная заметка', { exact: true }).fill('SYNTHETIC_PRIVATE_PAIR_NOTE');
    const noteSaved = page.waitForResponse(response => response.url().endsWith('/api/assessments/pair') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'own-note');
    await page.getByRole('button', { name: 'Сохранить только мою заметку', exact: true }).click();
    assert.equal((await noteSaved).status(), 200);
    await page.getByText('Изменение сохранено и повторно проверено сервером.', { exact: true }).waitFor();
    assert.equal((await browserJson(page, '/api/assessments/pair')).body.data.ownNote, 'SYNTHETIC_PRIVATE_PAIR_NOTE');
    await peer.reload(); await peer.getByLabel('Моя личная заметка', { exact: true }).waitFor();
    assert.equal(await peer.getByLabel('Моя личная заметка', { exact: true }).inputValue(), ''); assert.deepEqual(await sharedView(peer), closedBefore);
  });
  await check('browser-shared-disagreement', 'two independently shared reports retain request for change beside positive peer report', async () => {
    await page.getByRole('checkbox', { name: /Разрешаю показать этот отчёт/ }).check();
    const reportSaved = page.waitForResponse(response => response.url().endsWith('/api/assessments/pair') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'report' && response.request().postDataJSON()?.shared === true);
    await page.getByRole('button', { name: 'Сохранить мой отчёт', exact: true }).click(); assert.equal((await reportSaved).status(), 200);
    await page.getByText('Изменение сохранено и повторно проверено сервером.', { exact: true }).waitFor();
    await peer.reload(); await peer.getByRole('combobox', { name: 'Выберите прошедшее или начавшееся повторение', exact: true }).selectOption(reportPeriod);
    await peer.getByRole('radio', { name: 'Договорённость подходит хорошо', exact: true }).check(); await peer.getByRole('checkbox', { name: /Разрешаю показать этот отчёт/ }).check();
    await peer.getByRole('button', { name: 'Сохранить мой отчёт', exact: true }).click();
    await peer.getByText('Как минимум один участник просит пересмотр. Другое мнение не отменяет этой просьбы.', { exact: true }).waitFor();
    const common = (await sharedView(peer)).join(' '); assert.match(common, /Хочу изменить договорённость/); assert.match(common, /Подходит хорошо/);
    assert.deepEqual((await browserJson(page, '/api/assessments/portfolio')).body.data.profile, actualBefore);
  });
  await check('browser-authored-agreement', 'a revised authored future agreement requires two separate UI confirmations and preserves past occurrences and actual', async () => {
    await page.reload(); await page.getByText('Подготовить новую редакцию', { exact: true }).click();
    await page.getByLabel('Название', { exact: true }).fill('Согласованная проверка списка дел');
    const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    await page.getByLabel('Первый день', { exact: true }).fill(date(1));
    await page.getByLabel('До даты (этот день не включён)', { exact: true }).fill(date(15));
    await page.getByRole('button', { name: 'Предложить эту новую редакцию', exact: true }).click();
    await page.getByText('Нужны два отдельных подтверждения одного содержания.', { exact: true }).waitFor();
    await page.getByRole('checkbox', { name: 'Я прочитал эту редакцию и добровольно подтверждаю только своё участие.', exact: true }).check();
    await page.getByRole('button', { name: 'Подтвердить моё участие', exact: true }).click();
    await page.getByRole('button', { name: 'Подтвердить моё участие', exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('Нужны два отдельных подтверждения одного содержания.', { exact: true }).waitFor();
    await peer.reload(); await peer.getByRole('checkbox', { name: 'Я прочитал эту редакцию и добровольно подтверждаю только своё участие.', exact: true }).check();
    await peer.getByRole('button', { name: 'Подтвердить моё участие', exact: true }).click();
    await peer.getByText('Оба участника подтвердили именно эту редакцию.', { exact: true }).waitFor();
    await page.reload(); await page.getByText('Оба участника подтвердили именно эту редакцию.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: 'Выберите прошедшее или начавшееся повторение', exact: true }).locator(`option[value="${reportPeriod}"]`).count(), 1);
    assert.deepEqual((await browserJson(page, '/api/assessments/portfolio')).body.data.profile, actualBefore);
  });
  await peerContext.close();
  await check('browser-pair-reflow', 'pair readouts and selected controls fit 320px without horizontal text scroll', async () => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); });
  stage = 'conditions';
  await page.goto(`${origin}/assessments/conditions`); await page.getByLabel('Часовой пояс IANA', { exact: true }).waitFor();
  await check('browser-local-dates', 'saved local midnight dates round trip across a positive UTC offset', async () => {
    const beforeStart = await page.getByLabel('Первый день', { exact: true }).inputValue();
    const beforeEnd = await page.getByLabel('Конец периода (этот день не включён)', { exact: true }).inputValue();
    await page.getByLabel('Часовой пояс IANA', { exact: true }).fill('');
    await page.getByLabel('Часовой пояс IANA', { exact: true }).pressSequentially('Asia/Almaty', { delay: 10 });
    await page.getByRole('button', { name: 'Сохранить мои условия', exact: true }).click();
    await page.getByText('Условия сохранены. Предыдущие зависимые расчёты требуют обновления.', { exact: true }).waitFor();
    await page.reload(); await page.getByLabel('Первый день', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Первый день', { exact: true }).inputValue(), beforeStart);
    assert.equal(await page.getByLabel('Конец периода (этот день не включён)', { exact: true }).inputValue(), beforeEnd);
  });
  await check('browser-time-error-focus', 'ambiguous DST local time is rejected and keyboard focus moves to the error', async () => {
    await page.getByLabel('Часовой пояс IANA', { exact: true }).fill('America/New_York');
    const windows = page.getByRole('group', { name: 'Мои доступные окна', exact: true });
    await windows.getByLabel('Начало', { exact: true }).fill('2026-11-01T01:30');
    await windows.getByLabel('Конец', { exact: true }).fill('2026-11-01T02:30');
    await windows.getByRole('button', { name: 'Добавить окно', exact: true }).click();
    await windows.getByRole('alert').waitFor();
    assert.equal(await windows.getByRole('alert').evaluate(node => node === document.activeElement), true);
  });
  stage = 'profile-completion';
  await runBetaProfileBrowser({ page, browser, browserJson, readRun, check, origin, login, watch });
  stage = 'task';
  await page.goto(`${origin}/assessments/forms/com-s04-task-beta`); await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').first().click(); await active();
  await check('browser-structured-keyboard', 'all structured plan slots and changed-condition stage work without dragging', async () => {
    const groups = page.locator('fieldset').filter({ has: page.locator('input[name^="slot-"]') });
    const slots = await groups.count(); assert.ok(slots > 1);
    for (let i = 0; i < slots; i++) await groups.nth(i).getByRole('radio').first().press('Space');
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).press('Enter'); await page.getByText(/Сохранено: 1 из/).waitFor();
    const value = await readRun(page, 'com-s04-task-beta'); assert.equal(value.answers[0].response.kind, 'STRUCTURED'); assert.equal(value.answers[0].phase, 'BASELINE');
    await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').nth(1).click(); await active();
    assert.equal(await groups.count() > 1, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  await check('browser-complete-task', 'native structured choices finish every baseline and changed-condition stage then review finalize a separate D result', async () => {
    const started = await readRun(page, 'com-s04-task-beta');
    for (let index = 1; index < started.items.length; index++) {
      const presentation = page.waitForResponse(response => response.url().endsWith('/api/assessments/runs') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'present' && response.request().postDataJSON()?.itemId === started.items[index].id);
      await page.getByRole('navigation', { name: 'Сохранённые этапы' }).locator('ol button').nth(index).click(); assert.equal((await presentation).status(), 200); await active();
      await page.getByRole('heading', { name: started.items[index].title, exact: true }).waitFor();
      const groups = page.locator('fieldset').filter({ has: page.locator('input[name^="slot-"]') });
      const count = await groups.count(); assert.ok(count > 1);
      for (let slot = 0; slot < count; slot++) await groups.nth(slot).getByRole('radio').first().press('Space');
      await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).press('Enter');
      await page.getByRole('navigation', { name: 'Сохранённые этапы' }).locator('ol button').nth(index).filter({ hasText: '· сохранено' }).waitFor();
    }
    await page.getByRole('button', { name: 'Проверить и завершить', exact: true }).press('Enter');
    await page.getByRole('heading', { name: 'Проверка ответов', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Завершить и обновить личный результат', exact: true }).click();
    await page.getByRole('button', { name: 'Исправить это основание', exact: true }).waitFor();
    const completed = await readRun(page, 'com-s04-task-beta');
    assert.equal(completed.status, 'FINALIZED'); assert.equal(completed.answers.length, started.items.length);
    assert.ok(completed.answers.every(answer => answer.response.kind === 'STRUCTURED')); assert.ok(started.items.some(item => item.id.endsWith('-changed')));
    const skill = completed.profile.snapshot.skills.find(value => value.skillId === 'COM.S04');
    assert.equal(skill.K.status, 'UNKNOWN'); assert.equal(skill.A.status, 'UNKNOWN'); assert.notEqual(skill.D.status, 'UNKNOWN');
    await page.locator('[data-skill-id="COM.S04"]').getByText('Учебное выполнение', { exact: true }).waitFor();
  });
  await page.goto(`${origin}/assessments`); await settled(page);
  stage = 'knowledge';
  await page.getByRole('link', { name: 'Конкретная просьба — понимание', exact: true }).click();
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').first().click(); await active();
  await check('browser-keyboard-option', 'native radio can be selected and submitted from keyboard with heading focus', async () => {
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H2');
    const radio = page.getByRole('radio').first(); await radio.press('Space');
    assert.equal(await radio.isChecked(), true);
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).press('Enter');
    await page.getByText(/Сохранено: 1 из/).waitFor();
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).answers.length, 1);
  });
  await check('browser-draft-resume', 'server-confirmed draft survives actual browser reload', async () => {
    await page.reload(); await page.getByText(/Сохранено: 1 из/).waitFor();
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).answers.length, 1);
  });
  await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').nth(1).click(); await active();
  await page.getByRole('radio').first().check();
  await check('browser-lost-response', 'acknowledged database save with lost HTTP response retries same intent without duplicate answer', async () => {
    let discarded = false;
    await page.route('**/api/assessments/runs', async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'answer' && !discarded) {
        const response = await fetchRoute(route); assert.equal(response.status(), 200); discarded = true; await route.abort('connectionreset');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).waitFor();
    assert.equal(discarded, true); assert.equal((await readRun(page, 'com-s02-knowledge-beta')).answers.length, 2);
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByText(/Сохранено: 2 из/).waitFor();
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).answers.length, 2);
    await page.unroute('**/api/assessments/runs');
  });
  await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').nth(2).click(); await active();
  await page.getByRole('radio').first().check();
  await check('browser-offline', 'offline failure preserves unsent own response and announces uncertainty', async () => {
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).waitFor();
    assert.equal(await page.getByRole('radio').first().isChecked(), true);
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByText(/Сохранено: 3 из/).waitFor();
  });
  await check('browser-review-focus', 'review heading receives visible keyboard focus and incomplete work cannot be finalized', async () => {
    await page.getByRole('button', { name: 'Проверить и завершить', exact: true }).press('Enter');
    const review = page.getByRole('heading', { name: 'Проверка ответов', exact: true }); await review.waitFor();
    assert.equal(await review.evaluate(node => node === document.activeElement), true);
    assert.equal(await page.getByRole('button', { name: 'Завершить и обновить личный результат', exact: true }).isDisabled(), true);
  });
  await check('browser-conflict-limit', 'real concurrent revision conflict and injected HTTP rate limit preserve unsent choice without false saved or overwrite', async () => {
    await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').nth(2).click(); await active();
    await page.getByRole('radio').first().check();
    const previous = await readRun(page, 'com-s02-knowledge-beta');
    const advanced = await page.evaluate(async input => (await fetch('/api/assessments/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status,
      { action: 'present', publicationId: previous.publication.id, itemId: previous.items[2].id, expectedRevision: previous.revision, viewerToken: previous.viewerToken, idempotencyKey: 'concurrent-own-presentation' });
    assert.equal(advanced, 200);
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).waitFor();
    assert.equal(await page.getByRole('radio').first().isChecked(), true);
    assert.equal(await page.getByText('Ответ сохранён на сервере.', { exact: true }).count(), 0);
    assert.deepEqual((await readRun(page, 'com-s02-knowledge-beta')).answers, previous.answers);
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).click();
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('navigation', { name: 'Сохранённые этапы' }).getByRole('button').nth(2).click(); await active();
    await page.getByRole('radio').first().check();
    let limited = false;
    await page.route('**/api/assessments/runs', async route => {
      if (!limited && route.request().method() === 'POST' && route.request().postDataJSON()?.action === 'answer') { limited = true; await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '1' }, body: JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Слишком частые запросы. Повторите позже.' } }) }); }
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
    await page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true }).waitFor();
    assert.equal(limited, true); assert.equal(await page.getByRole('radio').first().isChecked(), true);
    assert.equal(await page.getByText('Ответ сохранён на сервере.', { exact: true }).count(), 0);
    assert.deepEqual((await readRun(page, 'com-s02-knowledge-beta')).answers, previous.answers);
    await page.unroute('**/api/assessments/runs');
    await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click(); await page.getByText('Ответ сохранён на сервере.', { exact: true }).waitFor();
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).answers.length, 3);
  });
  await check('browser-decline', 'declining the proposed module is persisted and does not lower actual profile', async () => {
    await page.goto(`${origin}/assessments`); await settled(page);
    const before = (await browserJson(page, '/api/assessments/portfolio')).body.data;
    assert.ok(before.planner.publicationId);
    await page.getByRole('button', { name: 'Сейчас не хочу этот модуль', exact: true }).click();
    await page.getByText('Выбор сохранён на сервере.', { exact: true }).waitFor();
    const after = (await browserJson(page, '/api/assessments/portfolio')).body.data;
    assert.deepEqual(after.profile, before.profile);
    assert.notEqual(after.planner.publicationId, before.planner.publicationId);
    await page.goto(`${origin}/assessments/forms/com-s02-knowledge-beta`); await page.getByText(/Сохранено: 3 из/).waitFor();
  });
  stage = 'same-origin';
  const oldRun = await readRun(page, 'com-s02-knowledge-beta');
  await page.goto(`${origin}/assessments/support`); await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).fill('SYNTHETIC_A_PRIVATE_DRAFT');
  const second = await context.newPage(); second.setDefaultTimeout(12000);
  await second.goto(`${origin}/profile/settings`);
  await check('browser-cross-tab-logout', 'real logout UI on second same-origin tab synchronously invalidates first tab private form', async () => {
    await second.getByRole('button', { name: 'Завершить все сеансы', exact: true }).click();
    const logout = second.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST');
    await second.getByRole('button', { name: 'Да, завершить', exact: true }).click(); assert.equal((await logout).status(), 200); await second.waitForURL(`${origin}/`);
    await page.waitForFunction(() => ![...document.querySelectorAll('textarea')].some(node => node.value.includes('SYNTHETIC_A_PRIVATE_DRAFT')));
    assert.equal((await browserJson(page, '/api/assessments/settings')).status, 401);
  });
  await second.goto(`${login}/same-origin/b`); await settled(second);
  await check('browser-same-origin-switch', 'same cookie origin A logout B login rejects A draft and B mutation targets B', async () => {
    await page.bringToFront(); await page.reload();
    await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).inputValue(), '');
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).status, 'NEW');
    const oldSubmitStatus = await page.evaluate(async input => (await fetch('/api/assessments/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status,
      { action: 'present', publicationId: oldRun.publication.id, itemId: oldRun.items[0].id, expectedRevision: oldRun.revision, viewerToken: oldRun.viewerToken, idempotencyKey: 'late-old-owner-submit' });
    assert.equal(oldSubmitStatus, 409);
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).status, 'NEW');
    await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).fill('SYNTHETIC_B_SUPPORT');
    let supportCaptured; let releaseSupport;
    const heldSupport = new Promise(done => { releaseSupport = done; });
    await page.route('**/api/assessments/support', async route => {
      if (route.request().method() === 'POST') { const response = await fetchRoute(route); supportCaptured = response; await heldSupport; await route.fulfill({ response }); }
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Отправить только это сообщение', exact: true }).click();
    for (let attempt = 0; attempt < 100 && !supportCaptured; attempt++) await new Promise(done => setTimeout(done, 25));
    assert.ok(supportCaptured); assert.equal(supportCaptured.status(), 200);
    assert.equal(await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).inputValue(), 'SYNTHETIC_B_SUPPORT');
    releaseSupport();
    await page.getByText(/Обращение сохранено/).waitFor();
    await page.unroute('**/api/assessments/support');
    const response = await browserJson(page, '/api/assessments/support'); assert.equal(response.body.data.length, 1);
  });
  await check('browser-history', 'real back and forward after account change never restores A response values', async () => {
    await page.goBack(); await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: 'Начать', exact: true }).waitFor();
    assert.equal(await page.getByRole('radio').count(), 0);
    await page.goForward(); await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).inputValue(), '');
  });
  stage = 'late-response';
  await second.goto(`${login}/same-origin/a`); await settled(second);
  let release; const blocked = new Promise(resolveBlock => { release = resolveBlock; }); let captured, delivered = false;
  await page.route('**/api/assessments/runs?*', async route => {
    if (route.request().method() === 'GET' && !captured) { const response = await fetchRoute(route); captured = response; await blocked; await route.fulfill({ response }); delivered = true; }
    else await route.continue();
  });
  await page.goto(`${origin}/assessments/forms/com-s02-knowledge-beta`);
  for (let i = 0; i < 100 && !captured; i++) await new Promise(resolveWait => setTimeout(resolveWait, 50));
  assert.ok(captured, 'A HTTP response was captured before identity changed');
  assert.equal(captured.status(), 200);
  const capturedData = await captured.json(); assert.equal(capturedData.ok, true);
  assert.equal(capturedData.data.runId, oldRun.runId); assert.deepEqual(capturedData.data.answers, oldRun.answers);
  await second.goto(`${origin}/profile/settings`); await second.getByRole('button', { name: 'Завершить все сеансы', exact: true }).click();
  const laterLogout = second.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST');
  await second.getByRole('button', { name: 'Да, завершить', exact: true }).click(); assert.equal((await laterLogout).status(), 200); await second.waitForURL(`${origin}/`);
  await second.goto(`${login}/same-origin/b`); await settled(second); release();
  await check('browser-late-fetch', 'A real HTTP response completed after B login is rejected; current owner is revalidated', async () => {
    for (let attempt = 0; attempt < 100 && !delivered; attempt++) await new Promise(done => setTimeout(done, 25));
    assert.equal(delivered, true);
    await page.bringToFront(); await page.unroute('**/api/assessments/runs?*');
    await page.getByRole('button', { name: /^(Начать|Проверить сохранённое состояние)$/ }).waitFor();
    assert.equal(await page.getByText(/Сохранено: 3 из/).count(), 0);
    assert.equal(await page.getByRole('radio').count(), 0);
    const retry = page.getByRole('button', { name: 'Проверить сохранённое состояние', exact: true });
    if (await retry.isVisible()) await retry.click();
    await page.getByRole('button', { name: 'Начать', exact: true }).waitFor();
    assert.equal(await page.getByText(/Сохранено: 3 из/).count(), 0);
    assert.equal(await page.getByRole('radio').count(), 0);
    assert.equal((await readRun(page, 'com-s02-knowledge-beta')).status, 'NEW');
  });
  await second.close();
  stage = 'bfcache';
  // Separate routing-free context allows a genuine browser history-cache trial.
  const history = await browser.newContext(); watch(history); const hp = await history.newPage();
  await hp.addInitScript(() => { window.addEventListener('pageshow', event => { window.__betaPersisted = event.persisted; }); });
  await hp.goto(`${login}/same-origin/a`); await settled(hp);
  await hp.goto(`${origin}/assessments/support`); await hp.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).fill('SYNTHETIC_BFCACHE_PRIVATE');
  hp.on('dialog', dialog => dialog.accept());
  await hp.goto(`${login}/same-origin/b`); await settled(hp); await hp.goBack();
  await hp.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).waitFor();
  assert.equal(await hp.getByRole('textbox', { name: 'Ваше сообщение', exact: true }).inputValue(), '');
  const persisted = await hp.evaluate(() => window.__betaPersisted === true);
  const notRestoredReasons = await hp.evaluate(() => performance.getEntriesByType('navigation')[0]?.notRestoredReasons?.toJSON?.() ?? null);
  records.push({ id: 'browser-native-bfcache', status: persisted ? 'PASSED' : 'NOT_RUN', name: 'Native persisted pageshow with actor change', detail: persisted ? 'Browser restored cached document; private value absent' : 'Browser performed normal history navigation; do not call this bfcache evidence', notRestoredReasons, layer: 'CHROMIUM_PRODUCTION_NEXT_HTTP_MONGODB' });
  await history.close();
  await check('browser-private-traces', 'entered own answer note and support markers never enter observed console errors request URLs or session replay sinks', async () => { assert.equal(traceViolations.size, 0); });
} catch (error) {
  // Browser errors can contain request headers. Keep only class + source line.
  process.exitCode = 1;
  records.push({ id: stage, status: 'FAILED', name: error instanceof Error ? error.name : 'Browser assertion failed', location: /(?:beta-profile-browser|beta-browser)\.mjs:\d+:\d+/.exec(error?.stack ?? '')?.[0] ?? null,
    pages: await Promise.all(context.pages().map(async target => ({ url: target.url(), headings: await target.locator('h1,h2,[role=alert]').allTextContents().catch(() => ['PAGE_CHANGED_DURING_FAILURE_CAPTURE']) }))) });
} finally {
  await context.setOffline(false).catch(() => undefined);
  await writeFile(resolve(out, 'browser-results.json'), JSON.stringify({ version: 'beta-browser-evidence-v1', runId: args['run-id'] ?? null, sourceIdentity: args['source-identity'] ?? null, startedAgainst: origin, playwright: runtimeVersion, chromium: browser.version(), nativeScreenReader: 'NOT_RUN', realOAuth: 'NOT_RUN', records }, null, 2), { flag: 'wx' });
  await browser.close();
  process.stdout.write(`${JSON.stringify({ suite: 'beta-browser', status: process.exitCode ? 'FAILED' : 'PASSED_EXECUTED_ASSERTIONS', assertions: records.length, notRun: records.filter(row => row.status === 'NOT_RUN').map(row => row.id), output: resolve(out, 'browser-results.json') })}\n`);
}
