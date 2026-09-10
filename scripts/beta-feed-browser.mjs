/** Actual discovery React flow against production Next and an owned synthetic MongoDB. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); assert.ok(i > 2); return [arg.slice(2, i), arg.slice(i + 1)]; }));
const origin = args.origin ?? 'http://vmeste-a.localhost:3106';
const login = args.login ?? 'http://vmeste-a.localhost:3107';
for (const address of [origin, login]) { const url = new URL(address); assert.equal(url.hostname, 'vmeste-a.localhost'); assert.equal(url.protocol, 'http:'); assert.equal(url.username, ''); assert.equal(url.password, ''); }
const modulePath = args.module ?? process.env.BETA_PLAYWRIGHT_MODULE;
assert.ok(modulePath && isAbsolute(modulePath), 'Explicit external Playwright module path is required');
assert.ok(args['run-id'] && args['source-identity'], 'Invocation and tree identities are required');
const out = resolve(args.output ?? process.env.BETA_EVIDENCE_DIR ?? '../foreverApp-beta-feed-browser-evidence');
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(modulePath);
const runtimeVersion = require(resolve(modulePath, 'package.json')).version;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const records = [];
const check = async (id, name, work) => { await work(); records.push({ id, name, status: 'PASSED', layer: 'CHROMIUM_PRODUCTION_NEXT_HTTP_MONGODB' }); process.stdout.write(`${JSON.stringify(records.at(-1))}\n`); };
const json = async (target, path) => {
  const result = await target.evaluate(async url => { const response = await fetch(url, { cache: 'no-store' }); return { status: response.status, body: await response.json() }; }, path);
  assert.equal(result.status, 200); return result.body.data;
};
const settled = target => target.getByRole('radio', { name: /^Для себя(?:\s|$)/ }).waitFor();
const visibleStages = async target => {
  await target.locator('.app-assessment-form-stage-navigation').first().waitFor({ state: 'attached' });
  const mobile = target.locator('.app-assessment-form-mobile-stages');
  if (await mobile.isVisible()) {
    if (!await mobile.evaluate(node => node.open)) await mobile.locator(':scope > summary').click();
    return mobile.getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
  }
  return target.locator('.app-assessment-form-desktop-stages').getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
};
const feed = target => target.getByRole('region', { name: 'Участники знакомств', exact: true });
const visibleCard = async target => { await feed(target).getByRole('button', { name: 'Открыть сравнение и карточку', exact: true }).waitFor(); assert.equal(await feed(target).locator(':scope > article').count(), 1); };
const openCard = async target => { await visibleCard(target); await target.getByRole('button', { name: 'Открыть сравнение и карточку', exact: true }).click(); await target.getByRole('heading', { name: 'Карточка и добровольный контакт', exact: true }).waitFor(); };
const noPair = async target => { assert.deepEqual(await json(target, '/api/pairs/me'), { pair: null, hasActive: false, hasAny: false, status: null }); };
const navigateFeed = async target => { await target.goto(`${origin}/assessments/discovery`); await visibleCard(target); };
const prepareQuestions = async target => {
  const composer = target.getByRole('region', { name: 'Ваш ответ человеку', exact: true });
  await composer.getByRole('button', { name: 'Начать ответ', exact: true }).click();
  const reactions = composer.getByRole('radio', { name: 'Согласен', exact: true }); assert.equal(await reactions.count(), 9);
  for (let i = 0; i < await reactions.count(); i++) await reactions.nth(i).check();
  await composer.getByRole('button', { name: 'К обязательным вопросам', exact: true }).click();
  assert.equal(await composer.getByRole('textbox').count(), 3); return composer;
};
let stage = 'bootstrap';
try {
  const bootstrap = await fetch(`http://127.0.0.1:${new URL(login).port}/status`, { headers: { host: new URL(login).host } }); assert.equal(bootstrap.status, 200);
  const fixture = await bootstrap.json(); assert.equal(fixture.ready, true); assert.equal(fixture.fixture, 'beta-feed'); assert.equal(fixture.participants, 2); assert.equal(fixture.realOAuthValidated, false);
  await page.goto(`${login}/same-origin/a`); await settled(page);
  const actorA = (await json(page, '/api/users/me')).id;
  assert.match(actorA, /^local-acceptance-[a-f0-9]{12}-a$/);
  stage = 'solo-unknown';
  await check('browser-solo-unknown', 'SOLO user completes actual COM application with no experience or opportunity and retains unknown A and private negative rates', async () => {
    await noPair(page);
    await page.goto(`${origin}/assessments/forms/com-s04-application-beta`);
    await page.getByLabel('Первый день', { exact: true }).fill(new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10));
    await page.getByLabel('Последний завершённый день', { exact: true }).fill(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Начать отдельную волну наблюдений', exact: true }).click();
    await (await visibleStages(page)).waitFor();
    const run = await json(page, '/api/assessments/runs?publicationId=com-s04-application-beta');
    assert.equal(run.status, 'DRAFT'); assert.ok(run.items.length >= 3); assert.ok(run.items.every(item => item.available));
    for (let index = 0; index < run.items.length; index++) {
      await (await visibleStages(page)).locator('ol button').nth(index).click();
      await page.getByRole('heading', { name: run.items[index].title, exact: true }).waitFor();
      const missing = page.locator('.app-assessment-form-skip-section');
      if (!await missing.evaluate(node => node.open)) await missing.locator(':scope > summary').click();
      await page.getByRole('radio', { name: index % 2 ? 'Нет такого опыта' : 'Не было подходящей возможности', exact: true }).check();
      await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
      await (await visibleStages(page)).locator('ol button').nth(index).getByText('Сохранено', { exact: true }).waitFor();
    }
    await (await visibleStages(page)).getByRole('button', { name: 'Проверить и завершить', exact: true }).click();
    await page.getByRole('heading', { name: 'Проверка ответов', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Завершить и обновить личный результат', exact: true }).click();
    await page.locator('[data-skill-id="COM.S04"]').waitFor();
    const completed = await json(page, '/api/assessments/runs?publicationId=com-s04-application-beta'); assert.equal(completed.status, 'FINALIZED');
    assert.ok(completed.answers.every(answer => answer.response.kind === 'MISSING' && ['NO_EXPERIENCE', 'NO_OPPORTUNITY'].includes(answer.response.reason)));
    const profile = (await json(page, '/api/assessments/portfolio')).profile.snapshot.skills.find(skill => skill.skillId === 'COM.S04'); assert.ok(profile);
    assert.equal(profile.A.exactLevel, null); assert.equal(profile.A.observationCount, 0); assert.deepEqual(profile.A.possibleLevels, [0, 1, 2, 3]);
    for (const negative of [profile.CMinus, ...profile.NMinus]) { assert.equal(negative.evidence.signedRate, null); assert.equal(negative.evidence.denominator, 0); assert.equal(negative.evidence.occurrenceRoots.length, 0); }
    const rendered = page.locator('[data-skill-id="COM.S04"]'); assert.equal(await rendered.getByText('Неизвестно: нет подходящих данных', { exact: true }).count(), 3); assert.equal(await rendered.getByText('Уровень 0', { exact: true }).count(), 0);
    await rendered.getByText(/неизвестно: недостаточно подходящих описанных случаев/).first().waitFor(); await noPair(page);
  });
  await navigateFeed(page);
  const initial = await json(page, '/api/assessments/discovery'); assert.equal(initial.cards.length, 1);
  const actorB = initial.cards[0].candidateId; assert.notEqual(actorA, actorB);
  assert.equal(actorB, actorA.slice(0, -1) + 'b');
  stage = 'feed-current';
  await check('browser-feed-current', 'real beta discovery renders one authorized current lane and opens actual two-direction comparison', async () => {
    assert.equal(initial.cards[0].lane, 'CURRENT_SUPPORTED');
    await feed(page).getByRole('heading', { name: initial.cards[0].displayName, exact: true }).waitFor();
    await feed(page).getByText('Текущие условия', { exact: true }).waitFor();
    const settings = await json(page, '/api/assessments/settings'); assert.equal(settings.settings.discovery, true); assert.equal(settings.settings.pairSharing, false);
    await noPair(page); await openCard(page);
    const current = feed(page).locator('section').filter({ has: page.getByRole('heading', { name: 'Сейчас', exact: true }) });
    await current.getByText('Условия поддержаны известными данными', { exact: true }).waitFor();
    assert.equal(await current.locator('dd').filter({ hasText: /^поддержано$/ }).count(), 3);
    await page.getByText('Расчёт не записывает готовность человека, не меняет его границы и не создаёт договорённость.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(out, 'beta-feed-320.png'), fullPage: true });
  });
  stage = 'feed-network';
  await check('browser-feed-network', 'failed real detail fetch shows retry with no cached contact and retry recovers authorized content', async () => {
    await page.getByRole('button', { name: 'Закрыть подробности', exact: true }).click();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Открыть сравнение и карточку', exact: true }).click();
    await feed(page).getByRole('alert').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Карточка и добровольный контакт', exact: true }).count(), 0);
    await context.setOffline(false); await feed(page).getByRole('button', { name: 'Повторить', exact: true }).click();
    await page.getByRole('heading', { name: 'Карточка и добровольный контакт', exact: true }).waitFor();
  });
  const peerContext = await browser.newContext({ viewport: { width: 320, height: 760 } }); const peer = await peerContext.newPage(); peer.setDefaultTimeout(15000);
  await peer.goto(`${login}/same-origin/b`); await settled(peer);
  stage = 'feed-empty';
  await check('browser-feed-empty', 'withdrawing peer discovery produces real accessible empty state with conditions card inbox and settings choices', async () => {
    await peer.goto(`${origin}/profile/settings#assessment-settings`);
    const settings = peer.locator('#assessment-settings');
    await settings.getByRole('checkbox', { name: /^Включаю знакомства по моим условиям:/ }).uncheck();
    const withdrawn = peer.waitForResponse(response => response.url().endsWith('/api/assessments/settings') && response.request().method() === 'POST');
    await settings.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    assert.equal((await withdrawn).status(), 200);
    await settings.getByText('Выбор сохранён на сервере. Он применяется к следующим разрешённым действиям.', { exact: true }).waitFor();
    await page.reload(); await feed(page).getByRole('status').waitFor();
    assert.equal((await json(page, '/api/assessments/discovery')).cards.length, 0);
    assert.equal(await feed(page).locator('article').count(), 0);
    await page.getByText('Сейчас доступных карточек нет. Это не заключение о ваших навыках или шансах на отношения.', { exact: true }).waitFor();
    for (const name of ['Мои условия и время', 'Моя карточка знакомства', 'Входящие и контакты', 'Настройки поиска']) assert.equal(await page.getByRole('link', { name, exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: resolve(out, 'beta-feed-empty-320.png'), fullPage: true });
    await settings.getByRole('checkbox', { name: /^Включаю знакомства по моим условиям:/ }).check();
    await settings.getByRole('button', { name: 'Сохранить настройки', exact: true }).click();
    await settings.getByText('Выбор сохранён на сервере. Он применяется к следующим разрешённым действиям.', { exact: true }).waitFor();
    await page.reload(); await visibleCard(page);
  });
  stage = 'feed-account';
  await openCard(page); const oldComposer = await prepareQuestions(page);
  await oldComposer.getByRole('textbox').first().fill('SYNTHETIC_UNSENT_PRIVATE_A');
  const second = await context.newPage(); second.setDefaultTimeout(15000);
  await second.goto(`${origin}/profile/settings`); await second.getByRole('button', { name: 'Завершить все сеансы', exact: true }).click();
  const loggedOut = second.waitForResponse(response => response.url().endsWith('/api/auth/logout') && response.request().method() === 'POST');
  await second.getByRole('button', { name: 'Да, завершить', exact: true }).click(); assert.equal((await loggedOut).status(), 200); await second.waitForURL(`${origin}/`);
  await second.goto(`${login}/same-origin/b`); await settled(second);
  await check('browser-feed-account', 'same-origin account switch clears old candidate contact draft before new actor can submit', async () => {
    await page.bringToFront();
    // Session invalidation may finish while the tab is hidden. Check the safety
    // property before explicitly retrying the guarded current-owner request.
    await page.getByRole('textbox').first().waitFor({ state: 'hidden' });
    assert.equal(await page.getByText('SYNTHETIC_UNSENT_PRIVATE_A', { exact: true }).count(), 0);
    const retry = page.getByRole('button', { name: 'Повторить загрузку', exact: true });
    await page.getByRole('button', { name: /^(Повторить загрузку|Открыть сравнение и карточку)$/ }).first().waitFor();
    if (await retry.isVisible()) await retry.click();
    await visibleCard(page);
    assert.equal((await json(page, '/api/users/me')).id, actorB);
    assert.equal(await page.getByRole('textbox').count(), 0);
    assert.equal(await page.getByText('SYNTHETIC_UNSENT_PRIVATE_A', { exact: true }).count(), 0);
    await openCard(page);
    const composer = await prepareQuestions(page);
    for (const input of await composer.getByRole('textbox').all()) assert.equal(await input.inputValue(), '');
  });
  await second.close();
  stage = 'feed-contact';
  await check('browser-feed-contact', 'voluntary LikeComposer submit is authored only by current B and reaches A inbox without automatic Pair', async () => {
    const composer = page.getByRole('region', { name: 'Ваш ответ человеку', exact: true });
    const answers = ['Синтетический ответ B: доверие складывается постепенно.', 'Синтетический ответ B: прогулка и время для себя.', 'Синтетический ответ B: говорить по очереди.'];
    for (let i = 0; i < answers.length; i++) await composer.getByRole('textbox').nth(i).fill(answers[i]);
    await composer.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    assert.equal(await composer.getByRole('button', { name: 'Отправить интерес', exact: true }).isDisabled(), true);
    for (const choice of await composer.getByRole('checkbox').all()) await choice.check();
    const submitted = page.waitForResponse(response => response.url().endsWith('/api/match/like') && response.request().method() === 'POST');
    await composer.getByRole('button', { name: 'Отправить интерес', exact: true }).click(); assert.equal((await submitted).status(), 200);
    await page.getByRole('heading', { name: 'Интерес отправлен', exact: true }).waitFor();
    const outgoing = await json(page, '/api/match/inbox'); assert.equal(outgoing.outgoing.length, 1); assert.equal(outgoing.incoming.length, 0); assert.equal(outgoing.connections.length, 0);
    assert.equal(outgoing.outgoing[0].role, 'INITIATOR'); assert.equal(outgoing.outgoing[0].peer.id, actorA); await noPair(page);
    await peer.goto(`${login}/same-origin/a`); await settled(peer);
    const incoming = await json(peer, '/api/match/inbox'); assert.equal(incoming.incoming.length, 1); assert.equal(incoming.outgoing.length, 0); assert.equal(incoming.connections.length, 0);
    assert.equal(incoming.incoming[0].id, outgoing.outgoing[0].id); assert.equal(incoming.incoming[0].role, 'RECIPIENT'); assert.equal(incoming.incoming[0].peer.id, actorB); await noPair(peer);
    const detail = await json(peer, `/api/match/like/${encodeURIComponent(incoming.incoming[0].id)}`);
    assert.deepEqual(detail.initiatorAnswers, answers); assert.equal(detail.responseAnswers, undefined); assert.equal(JSON.stringify(detail).includes('SYNTHETIC_UNSENT_PRIVATE_A'), false);
    await page.getByRole('link', { name: 'Проверить отправленный интерес и ответы', exact: true }).click(); await page.waitForURL(`${origin}/match/inbox`);
  });
  await peerContext.close();
} catch (error) {
  // Assertion and browser exception text may contain private payloads; never retain it.
  records.push({ id: stage, name: error instanceof Error ? error.name : 'BrowserAssertionError', status: 'FAILED', layer: 'CHROMIUM_PRODUCTION_NEXT_HTTP_MONGODB', line: /beta-feed-browser\.mjs:(\d+)/.exec(error?.stack ?? '')?.[1] ?? null, numericActual: typeof error?.actual === 'number' ? error.actual : null });
  process.exitCode = 1;
} finally {
  await context.setOffline(false).catch(() => undefined);
  await writeFile(resolve(out, 'browser-feed-results.json'), JSON.stringify({ version: 'beta-browser-evidence-v1', runId: args['run-id'], sourceIdentity: args['source-identity'], startedAgainst: origin, playwright: runtimeVersion, chromium: browser.version(), nativeScreenReader: 'NOT_RUN', realOAuth: 'NOT_RUN', records }, null, 2), { flag: 'wx' });
  await browser.close();
  process.stdout.write(`${JSON.stringify({ suite: 'beta-feed-browser', status: process.exitCode ? 'FAILED' : 'PASSED_EXECUTED_ASSERTIONS', assertions: records.length })}\n`);
}
