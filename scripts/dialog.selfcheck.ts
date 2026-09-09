import assert from 'node:assert/strict';
import React, { type ComponentProps, type ReactElement } from 'react';
import type { DialogProps } from '../src/components/ui/Dialog';

// A small DOM/React adapter exercises the actual component's lifecycle and handlers.
// Layout, browser inert behavior, and screen-reader output require browser acceptance.
class FocusTarget {
  tabIndex = 0;
  disabled = false;
  hidden = false;
  visibility = 'visible';
  isConnected = true;
  owner: ModalTarget | null = null;
  focus() { focusTarget(this); }
  matches() { return this.disabled || this.hidden; }
  closest(selector: string) { return selector === 'dialog' ? this.owner : null; }
  getClientRects() { return this.hidden ? [] : [{}]; }
}
class ModalTarget extends FocusTarget {
  open = false;
  children: FocusTarget[] = [];
  showModal() { this.open = true; modalStack.push(this); }
  close() { this.open = false; modalStack.splice(modalStack.indexOf(this), 1); }
  querySelectorAll() { return this.children; }
}

type Dependencies = readonly (object | string | number | boolean | null | undefined)[];
type Probe = {
  refs: Array<{ current: object | null }>;
  effects: Array<{ dependencies?: Dependencies; cleanup?: () => void }>;
  queued: Array<() => void>;
  modal: ModalTarget;
  heading: FocusTarget;
};
const probe = (): Probe => ({ refs: [], effects: [], queued: [], modal: new ModalTarget(), heading: new FocusTarget() });
let current = probe();
let refIndex = 0;
let effectIndex = 0;
let activeElement: FocusTarget | null = null;
const modalStack: ModalTarget[] = [];
function focusTarget(target: FocusTarget) {
  const top = modalStack[modalStack.length - 1];
  if (!top || target.owner === top) activeElement = target;
}
const body = { style: { overflow: 'auto' } };
const originalDescriptors: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
function replace(target: object, key: string, value: object) {
  originalDescriptors.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}
function dispose(target: Probe) { target.effects.forEach((effect) => effect.cleanup?.()); target.effects = []; }

async function main() {
  replace(globalThis, 'HTMLElement', FocusTarget);
  replace(globalThis, 'Element', FocusTarget);
  replace(globalThis, 'document', { body, get activeElement() { return activeElement; } });
  replace(globalThis, 'window', { getComputedStyle: (element: FocusTarget) => ({ visibility: element.visibility }) });
  replace(React, 'useRef', (initial: object | null) => {
    const index = refIndex++;
    return current.refs[index] ?? (current.refs[index] = { current: initial });
  });
  replace(React, 'useId', () => 'dialog-label');
  replace(React, 'useEffect', (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const owner = current;
    const index = effectIndex++;
    const previous = owner.effects[index];
    if (previous?.dependencies && dependencies?.every((value, i) => Object.is(value, previous.dependencies?.[i]))) return;
    owner.queued.push(() => {
      previous?.cleanup?.();
      const cleanup = effect();
      owner.effects[index] = { dependencies, ...(cleanup ? { cleanup } : {}) };
    });
  });
  try {
    const { default: Dialog } = await import('../src/components/ui/Dialog');
    const render = (target: Probe, props: Partial<DialogProps> = {}) => {
      current = target; refIndex = 0; effectIndex = 0; target.queued = [];
      const tree = Dialog({ open: true, title: 'Оценка', onClose: () => { closes += 1; }, children: 'Содержание', ...props }) as ReactElement<ComponentProps<'dialog'>>;
      target.refs[0].current = target.modal;
      target.refs[1].current = target.heading;
      target.heading.owner = target.modal;
      target.heading.tabIndex = -1;
      target.queued.forEach((effect) => effect());
      return tree;
    };
    const parent = probe();
    const trigger = new FocusTarget(); trigger.focus();
    let closes = 0;
    let prevented = 0;
    let tree = render(parent);
    assert.equal(parent.modal.open, true);
    assert.equal(body.style.overflow, 'hidden');
    assert.equal(activeElement, parent.heading, 'opening focuses the descriptive heading');
    assert.equal(tree.props['aria-modal'], 'true');

    const first = new FocusTarget();
    const disabled = new FocusTarget(); disabled.disabled = true;
    const last = new FocusTarget();
    const invisible = new FocusTarget(); invisible.visibility = 'hidden';
    parent.modal.children = [first, disabled, last, invisible];
    parent.modal.children.forEach((item) => { item.owner = parent.modal; });
    const tab = (target: FocusTarget, shiftKey = false) => {
      // Synthetic event only uses the fields consumed by the actual component.
      const event = { key: 'Tab', shiftKey, target, currentTarget: parent.modal, preventDefault: () => { prevented += 1; } };
      tree.props.onKeyDown?.(event as object as React.KeyboardEvent<HTMLDialogElement>);
    };
    last.focus(); tab(last);
    assert.equal(activeElement, first, 'Tab wraps to the first available control');
    first.focus(); tab(first, true);
    assert.equal(activeElement, last, 'Shift+Tab excludes hidden and disabled controls');
    parent.heading.focus(); tab(parent.heading, true);
    assert.equal(activeElement, last, 'Shift+Tab from the initial heading remains inside');
    parent.modal.children = [disabled, invisible]; tab(parent.heading);
    assert.equal(activeElement, parent.heading, 'busy/no-controls state keeps a focus destination');

    const cancel = () => tree.props.onCancel?.({ target: parent.modal, currentTarget: parent.modal, preventDefault: () => { prevented += 1; } } as object as React.SyntheticEvent<HTMLDialogElement>);
    tree = render(parent, { busy: true });
    cancel(); assert.equal(closes, 0, 'Escape cannot discard a pending submission');
    tree = render(parent, { busy: false });
    cancel(); assert.equal(closes, 1, 'Escape requests consumer-controlled close after pending clears');
    assert.equal(parent.modal.open, true, 'consumer owns whether a dirty form really closes');

    first.focus();
    const nested = probe(); render(nested);
    assert.equal(body.style.overflow, 'hidden');
    const priorPrevention = prevented;
    tab(nested.heading);
    assert.equal(prevented, priorPrevention, 'a nested dialog key event is not trapped by the parent');
    dispose(nested);
    await Promise.resolve();
    assert.equal(activeElement, first, 'closing confirmation returns focus to the parent form');
    assert.equal(body.style.overflow, 'hidden', 'closing only one modal does not unlock the background');
    dispose(parent);
    await Promise.resolve();
    assert.equal(activeElement, trigger, 'closing the parent restores the original trigger');
    assert.equal(body.style.overflow, 'auto', 'last close restores the previous body overflow');
    assert.equal(parent.modal.open, false);
    const discarded = probe(); render(discarded);
    const formButton = new FocusTarget(); formButton.owner = discarded.modal; formButton.focus();
    const confirmation = probe(); render(confirmation);
    dispose(discarded);
    formButton.isConnected = false;
    dispose(confirmation);
    await Promise.resolve();
    assert.equal(activeElement, trigger, 'simultaneous parent/confirmation unmount restores focus after the top layer closes');
    assert.equal(body.style.overflow, 'auto');
    const fallback = new FocusTarget();
    const fallbackFocusRef = { current: fallback as object as HTMLElement };
    const connected = probe(); render(connected, { fallbackFocusRef }); dispose(connected);
    await Promise.resolve();
    assert.equal(activeElement, trigger, 'a connected original opener has priority over the explicit fallback');
    const detached = probe(); render(detached, { fallbackFocusRef });
    trigger.isConnected = false;
    dispose(detached);
    await Promise.resolve();
    assert.equal(activeElement, fallback, 'removing the opener after a successful action returns focus to the consumer-defined destination');
    console.log('Dialog self-check passed: focus/explicit fallback, nested isolation, busy Escape, controlled close, scroll restoration.');
  } finally {
    for (const { target, key, descriptor } of originalDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
