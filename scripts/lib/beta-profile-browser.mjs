import assert from 'node:assert/strict';

/** Real owner UI capture plus independent peer browser, called by beta-browser.
 * All writes use visible native form controls. APIs only inspect persisted state.
 * Requires the existing owned pair fixture and two previously unused forms. */
export async function runBetaProfileBrowser({ page, browser, browserJson, readRun, check, origin, login, watch }) {
  const knowledgeId = 'dom-s07-knowledge-beta', applicationId = 'com-s02-application-beta';
  const data = async (target, path) => { const result = await browserJson(target, path); assert.equal(result.status, 200); assert.equal(result.body.ok, true); return result.body.data; };
  const settled = target => target.getByRole('radio', { name: /^Для себя(?:\s|$)/ }).waitFor();
  const navigation = async () => {
    await page.locator('.app-assessment-form-stage-navigation').first().waitFor({ state: 'attached' });
    const mobile = page.locator('.app-assessment-form-mobile-stages');
    if (await mobile.isVisible()) {
      if (!await mobile.evaluate(node => node.open)) await mobile.locator(':scope > summary').click();
      return mobile.getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
    }
    return page.locator('.app-assessment-form-desktop-stages').getByRole('navigation', { name: 'Сохранённые этапы', exact: true });
  };
  const finish = async () => {
    await (await navigation()).getByRole('button', { name: 'Проверить и завершить', exact: true }).click();
    await page.getByRole('heading', { name: 'Проверка ответов', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Завершить и обновить личный результат', exact: true }).click();
    await page.getByRole('button', { name: 'Исправить это основание', exact: true }).waitFor();
  };
  const openFromHub = async publicationId => {
    await page.goto(`${origin}/assessments`); await settled(page);
    await page.getByRole('tab', { name: 'Анкеты', exact: true }).click();
    const run = await readRun(page, publicationId);
    const formLink = page.locator(`#assessment-topics a[href="/assessments/forms/${encodeURIComponent(publicationId)}"]`);
    await formLink.getByText(run.publication.title, { exact: true }).waitFor();
    await formLink.click();
  };
  const readComparison = async target => {
    const result = await target.evaluate(async () => {
      const response = await fetch('/api/assessments/compare', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actionIds: [] }), cache: 'no-store' });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(result.status, 200); assert.equal(result.body.ok, true); return result.body.data;
  };
  const peerContext = await browser.newContext({ viewport: { width: 320, height: 760 }, reducedMotion: 'reduce' }); watch?.(peerContext);
  const peer = await peerContext.newPage(); peer.setDefaultTimeout(15000);
  try {
    await peer.goto(`${login}/same-origin/b`); await settled(peer);
    const peerBefore = (await data(peer, '/api/users/me/profile-summary')).assessments;
    const comparisonBefore = await readComparison(peer); assert.equal(comparisonBefore.availability, 'AVAILABLE');
    const ownerBefore = (await data(page, '/api/assessments/portfolio')).profile.snapshot.skills.find(skill => skill.skillId === 'DOM.S07'); assert.ok(ownerBefore);
    assert.equal((await readRun(page, knowledgeId)).status, 'NEW'); assert.equal((await readRun(page, applicationId)).status, 'NEW');

    await check('browser-complete-knowledge', 'ordinary hub link native knowledge save review finalize renders K3 without replacing existing A', async () => {
      await openFromHub(knowledgeId); await page.getByRole('button', { name: 'Начать', exact: true }).click(); await (await navigation()).waitFor();
      const draft = await readRun(page, knowledgeId); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.items.length, 4);
      for (let index = 0; index < draft.items.length; index++) {
        await (await navigation()).locator('ol button').nth(index).click();
        await page.getByRole('heading', { name: draft.items[index].title, exact: true }).waitFor();
        await page.getByRole('group', { name: 'Выберите вариант', exact: true }).getByRole('radio').first().check();
        await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click();
        await (await navigation()).locator('ol button').nth(index).getByText('Сохранено', { exact: true }).waitFor();
      }
      await finish();
      const completed = await readRun(page, knowledgeId); assert.equal(completed.status, 'FINALIZED'); assert.equal(completed.answers.length, 4);
      const skill = completed.profile.snapshot.skills.find(skill => skill.skillId === 'DOM.S07'); assert.equal(skill.K.exactLevel, 3); assert.deepEqual(skill.A, ownerBefore.A);
      const rendered = page.locator('[data-skill-id="DOM.S07"]'); await rendered.locator('dl > div').first().getByRole('term').filter({ hasText: /^01\s*Понимание$/ }).waitFor();
      assert.equal(await rendered.locator('dl > div').first().getByText('Уровень 3', { exact: true }).isVisible(), true);
      await page.getByRole('link', { name: 'Темы, ответы и добровольные практики', exact: true }).click(); await settled(page);
      assert.ok((await data(page, '/api/assessments/portfolio')).planner.reasonCode);
    });

    let ownerCompleted;
    await check('browser-complete-application-profile', 'native real episode answers finalize and existing owner profile renders bounded negative fraction unknown A dates and history from actual API', async () => {
      await openFromHub(applicationId);
      const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
      await page.getByLabel('Первый день', { exact: true }).fill(day(-8)); await page.getByLabel('Последний завершённый день', { exact: true }).fill(day(-2));
      await page.getByRole('button', { name: 'Начать отдельную волну наблюдений', exact: true }).click(); await (await navigation()).waitFor();
      const draft = await readRun(page, applicationId); assert.equal(draft.status, 'DRAFT'); assert.equal(draft.items.length, 4);
      for (let index = 0; index < draft.items.length; index++) {
        await (await navigation()).locator('ol button').nth(index).click(); await page.getByRole('heading', { name: draft.items[index].title, exact: true }).waitFor();
        const selection = page.getByRole('combobox', { name: 'Это отдельный эпизод или уже описанный?' });
        if (await selection.count()) await selection.selectOption('NEW');
        await page.getByLabel(/^Когда произошёл этот эпизод \(UTC\)/).fill(`${day(-7 + index)}T12:00`);
        const groups = page.locator('fieldset').filter({ has: page.locator('input[name^="fact-"]') }); assert.ok(await groups.count() > 8);
        for (let fieldIndex = 0; fieldIndex < await groups.count(); fieldIndex++) {
          const group = groups.nth(fieldIndex), fieldId = (await group.locator('input').first().getAttribute('name')).slice('fact-'.length);
          const choice = fieldId === 'eligible' ? 'Да' : fieldId.startsWith('NEG.') ? index === 3 && fieldId.endsWith('.notCompleted') ? 'Не знаю / не помню' : 'Да' : 'Не знаю / не помню';
          await group.getByRole('radio', { name: choice, exact: true }).check();
        }
        await page.getByRole('button', { name: 'Сохранить ответ', exact: true }).click(); await (await navigation()).locator('ol button').nth(index).getByText('Сохранено', { exact: true }).waitFor();
      }
      await finish();
      ownerCompleted = await readRun(page, applicationId); assert.equal(ownerCompleted.status, 'FINALIZED'); assert.ok(ownerCompleted.answers.every(answer => answer.response.kind === 'FACTS'));
      const skill = ownerCompleted.profile.snapshot.skills.find(skill => skill.skillId === 'COM.S02');
      assert.equal(skill.A.exactLevel, null); assert.equal(skill.A.observationCount, 4); assert.deepEqual(skill.A.possibleLevels, [0, 1, 2, 3]);
      assert.equal(skill.CMinus.evidence.yes, 3); assert.equal(skill.CMinus.evidence.unknown, 1); assert.equal(skill.CMinus.evidence.denominator, 4); assert.equal(skill.CMinus.evidence.signedRate, null);
      assert.ok(skill.CMinus.evidence.signedBounds); assert.ok(skill.negativeHistory.length > 0); assert.deepEqual(skill.A.provenance.period, ownerCompleted.period);
      await page.goto(`${origin}/profile`);
      const rendered = page.locator('[data-skill-id="COM.S02"]'); await rendered.waitFor();
      await rendered.getByText('Частичные данные: уровень пока неизвестен', { exact: true }).waitFor();
      const negativeRow = rendered.locator('dl > div').filter({ has: page.getByText('Невыполнение договорённости', { exact: true }) });
      await negativeRow.locator('dt').getByText('Невыполнение договорённости', { exact: true }).waitFor();
      await negativeRow.locator('dd').getByText('от −4/4 до −3/4 описанных возможностей; часть исходов неизвестна.', { exact: true }).waitFor();
      assert.equal(await rendered.getByText('Уровень 0', { exact: true }).count(), 0);
      const formatted = value => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'UTC' });
      await rendered.getByText(`Период применения: ${formatted(ownerCompleted.period.startsAt)} — ${formatted(new Date(Date.parse(ownerCompleted.period.endsAt) - 1).toISOString())} (UTC).`, { exact: true }).waitFor();
      await rendered.getByText('История описанных проявлений', { exact: true }).click();
      await rendered.getByText('Датированное описание этого периода; новый пропуск не подтверждает исчезновение прежнего события.', { exact: true }).waitFor();
      const profile = (await data(page, '/api/users/me/profile-summary')).assessments;
      assert.deepEqual(profile.snapshot.skills.find(value => value.skillId === 'COM.S02'), skill);
      await page.getByRole('link', { name: 'Темы, ответы и добровольные практики', exact: true }).click(); await settled(page);
    });

    await check('browser-profile-private-provenance', 'independent peer browser retains own profile and complete comparison without owner private negative fraction or source provenance', async () => {
      assert.deepEqual((await data(peer, '/api/users/me/profile-summary')).assessments, peerBefore);
      assert.deepEqual(await readComparison(peer), comparisonBefore);
      await peer.goto(`${origin}/profile`); await peer.locator('[data-skill-id="DOM.S07"]').waitFor();
      const peerCommunication = peer.locator('[data-skill-id="COM.S02"]');
      assert.equal(await peerCommunication.getByText('Неизвестно: нет подходящих данных', { exact: true }).count(), 3);
      assert.equal(await peerCommunication.getByText('Частичные данные: уровень пока неизвестен', { exact: true }).count(), 0);
      assert.equal(await peer.getByText(/от −4\/4 до −3\/4/).count(), 0);
      const shared = await data(peer, '/api/assessments/pair');
      assert.ok(['AVAILABLE', 'UNAVAILABLE'].includes(shared.availability));
      await peer.goto(`${origin}/assessments/pair`);
      // Earlier explicit direct-condition edits can invalidate an old work context.
      // Verify the precise authorized UI branch; the independent fresh comparison
      // equality above remains required for both branches.
      await peer.getByRole('heading', { name: shared.availability === 'AVAILABLE' ? 'Текущие заявленные условия' : 'Совместный контекст пока недоступен', exact: true }).waitFor();
      if (shared.availability === 'UNAVAILABLE') {
        assert.equal(await peer.getByRole('heading', { name: 'Текущие заявленные условия', exact: true }).count(), 0);
        assert.equal(await peer.getByLabel('Моя личная заметка', { exact: true }).count(), 0);
      }
      assert.equal(await peer.getByText(/от −4\/4 до −3\/4/).count(), 0);
      const text = JSON.stringify(shared);
      assert.equal(text.includes(ownerCompleted.runId), false); assert.equal(text.includes('NEG.AGR.01'), false);
      assert.equal(text.includes('occurrenceRoots'), false); assert.equal(text.includes('signedBounds'), false);
    });
  } finally { await peerContext.close(); }
}
