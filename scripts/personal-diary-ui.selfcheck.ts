import assert from 'node:assert/strict';
import React, { type ReactElement, type ReactNode } from 'react';
import { usersApi } from '@/client/api/users.api';
import type { PersonalDailyCheckInRequest, PersonalTodayDTO } from '@/client/api/types';
import { normalizePersonalToday } from '@/client/viewmodels/personalToday.viewmodels';
import { dailyCheckInBodySchema } from '@/app/api/users/me/daily-checkins/request';

// Invoke the real form's handlers with synthetic state/API adapters. The wire
// schema is real; this check does not claim to exercise MongoDB or a browser.
type Cell = object | string | number | boolean | null | undefined;
type Props = {
  children?: ReactNode;
  id?: string;
  today?: PersonalTodayDTO;
  value?: string;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
};
const cells: Array<{ value: Cell }> = [];
let index = 0;
const originals: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
function replace(key: string, value: object) {
  originals.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) });
  Object.defineProperty(React, key, { configurable: true, value });
}
function find(node: ReactNode, predicate: (element: ReactElement<Props>) => boolean): ReactElement<Props> {
  const pending = React.Children.toArray(node);
  while (pending.length) {
    const child = pending.shift();
    if (!React.isValidElement<Props>(child)) continue;
    if (predicate(child)) return child;
    pending.push(...React.Children.toArray(child.props.children));
  }
  throw new Error('Expected form control was not rendered');
}

async function run() {
  const originalSubmit = usersApi.submitPersonalDailyCheckIn;
  replace('useState', <T extends Cell>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] => {
    const position = index++;
    const cell = cells[position] ?? (cells[position] = { value: typeof initial === 'function' ? initial() : initial });
    return [cell.value as T, (next) => { cell.value = typeof next === 'function' ? next(cell.value as T) : next; }];
  });
  replace('useMemo', <T extends Cell>(factory: () => T): T => factory());
  try {
    const { default: Dashboard } = await import('@/components/profile/today/PersonalTodayDashboard');
    const today = normalizePersonalToday({ privateJournal: { hasEntry: true, text: 'Сохранённая личная запись', placeholder: '', maxLength: 2000 } });
    assert.ok(today);
    const element = find(Dashboard({ today }), (child) => typeof child.type === 'function' && child.type.name === 'DailyCheckInCard');
    const Form = element.type as (props: { today: PersonalTodayDTO; onRefresh: () => Promise<void> }) => ReactNode;
    const submitted: PersonalDailyCheckInRequest[] = [];
    let refreshes = 0;
    let renderedToday = today;
    usersApi.submitPersonalDailyCheckIn = async (payload) => {
      submitted.push(dailyCheckInBodySchema.parse(JSON.parse(JSON.stringify(payload))));
      return today;
    };
    const render = () => {
      index = 0;
      return Form({ today: renderedToday, onRefresh: async () => { refreshes += 1; } });
    };
    const cases: Array<{ entered: string | null; expected: string | null }> = [
      { entered: '', expected: '' },
      { entered: '   ', expected: '' },
      { entered: 'Новая личная запись', expected: 'Новая личная запись' },
      { entered: null, expected: null },
    ];
    for (const { entered, expected } of cases) {
      cells.length = 0;
      const submittedBefore = submitted.length;
      renderedToday = today;
      if (entered !== null) {
        find(render(), (child) => child.props.id === 'personal-today-journal').props.onChange?.({ target: { value: entered } });
      } else {
        renderedToday = { ...today, privateJournal: { ...today.privateJournal, hasEntry: false, text: '' } };
        render();
        renderedToday = { ...today, privateJournal: { ...today.privateJournal, text: 'Запись из другой вкладки' } };
        assert.equal(find(render(), (child) => child.props.id === 'personal-today-journal').props.value, 'Запись из другой вкладки', 'an untouched journal follows refreshed owner data');
      }
      await find(render(), (child) => child.type === 'button' && child.props.children === 'Сохранить отметку').props.onClick?.();
      assert.equal(submitted.length, submittedBefore, 'incomplete state must not send a request');
      find(render(), (child) => child.props.id === 'personal-today-mood').props.onChange?.({ target: { value: 'calm' } });
      // Select an explicit value in every state field; no defaults are inserted.
      const form = render();
      const fields: ReactElement<Props>[] = [];
      const pending = React.Children.toArray(form);
      while (pending.length) {
        const child = pending.shift();
        if (!React.isValidElement<Props>(child)) continue;
        if (child.type === 'fieldset') fields.push(child);
        else pending.push(...React.Children.toArray(child.props.children));
      }
      assert.equal(fields.length, 7);
      for (const field of fields) find(field, (child) => child.type === 'button').props.onClick?.();
      await find(render(), (child) => child.type === 'button' && child.props.children === 'Сохранить отметку').props.onClick?.();
      assert.deepEqual(submitted.at(-1)?.privateJournal, expected === null ? undefined : { text: expected }, 'only explicit journal edits are sent, including an empty clear');
      assert.equal(submitted.length, refreshes, 'successful save refreshes the owner view');
    }
    assert.equal(submitted.length, 4);
    console.log('Personal diary UI self-check passed: required state, explicit clearing, whitespace clearing, replacement, untouched refreshed data, valid wire payload and refresh.');
  } finally {
    usersApi.submitPersonalDailyCheckIn = originalSubmit;
    for (const original of originals.reverse()) if (original.descriptor) Object.defineProperty(React, original.key, original.descriptor);
  }
}
void run().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
