import assert from 'node:assert/strict';
import React from 'react';

// Exercise the actual hook and browser-event contract with EventTarget, without
// claiming that a synthetic confirm adapter certifies any host's native dialog UI.
class Surface extends EventTarget {
  registrations: Array<{ type: string; listener: EventListenerOrEventListenerObject | null; capture: boolean }> = [];
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    this.registrations.push({ type, listener, capture: typeof options === 'boolean' ? options : Boolean(options?.capture) });
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this.registrations = this.registrations.filter((item) => !(item.type === type && item.listener === listener && item.capture === capture));
    super.removeEventListener(type, listener, options);
  }
}
class ElementProbe {
  constructor(private readonly anchor: AnchorProbe | null = null) {}
  closest() { return this.anchor; }
}
class AnchorProbe extends ElementProbe {
  target = '';
  download = false;
  constructor(readonly href: string) { super(); }
  override closest() { return this; }
  hasAttribute(name: string) { return name === 'download' && this.download; }
}

type Dependencies = readonly (boolean | object)[];
type Probe = {
  refs: Array<{ current: object }>;
  effects: Array<{ dependencies?: Dependencies; cleanup?: () => void }>;
  queued: Array<() => void>;
};
const probe = (): Probe => ({ refs: [], effects: [], queued: [] });
let current = probe(); let refIndex = 0; let effectIndex = 0;
const originalDescriptors: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
function replace(target: object, key: string, value: object) {
  originalDescriptors.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}
const dispose = (target: Probe) => { target.effects.forEach((effect) => effect.cleanup?.()); target.effects = []; };
function eventWith(type: string, fields: Record<string, object | string | number | boolean>, cancelable = true) {
  const event = new Event(type, { cancelable });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { configurable: true, value, writable: true });
  return event;
}

async function main() {
  const documentSurface = new Surface();
  const windowSurface = new Surface();
  const navigation = new Surface();
  let clock = 10_000;
  let confirmed = false;
  let confirmations = 0;
  Object.assign(windowSurface, {
    location: new URL('https://vmeste.test/development?run=current'),
    navigation,
    confirm: () => { confirmations += 1; return confirmed; },
  });
  replace(globalThis, 'window', windowSurface);
  replace(globalThis, 'document', documentSurface);
  replace(globalThis, 'Element', ElementProbe);
  replace(globalThis, 'HTMLAnchorElement', AnchorProbe);
  replace(Date, 'now', () => clock);
  replace(React, 'useRef', (initial: object) => {
    const index = refIndex++; return current.refs[index] ?? (current.refs[index] = { current: initial });
  });
  replace(React, 'useEffect', (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const owner = current; const index = effectIndex++; const previous = owner.effects[index];
    if (previous?.dependencies && dependencies && previous.dependencies.length === dependencies.length && dependencies.every((value, i) => Object.is(value, previous.dependencies?.[i]))) return;
    owner.queued.push(() => { previous?.cleanup?.(); const cleanup = effect(); owner.effects[index] = { dependencies, ...(cleanup ? { cleanup } : {}) }; });
  });
  const mounted: Probe[] = [];
  try {
    const { useUnsavedChanges, confirmAppNavigation } = await import('@/client/hooks/useUnsavedChanges');
    const renderHook = (target: Probe, callback: () => void) => {
      current = target; refIndex = 0; effectIndex = 0; target.queued = [];
      callback(); target.queued.forEach((effect) => effect());
    };
    const render = (target: Probe, dirty: boolean, pending = false) => renderHook(target, () => useUnsavedChanges(dirty, pending));
    const first = probe(); mounted.push(first); render(first, false);
    assert.equal(confirmAppNavigation(), true, 'clean app Back requires no prompt');
    assert.equal(confirmations, 0);
    assert.ok(documentSurface.registrations.some((item) => item.type === 'click' && item.capture), 'route links must be guarded in capture phase');
    clock += 1_000;
    render(first, true);
    assert.equal(confirmAppNavigation(), false, 'rejecting the prompt cancels the app Back event');
    assert.equal(confirmations, 1);
    confirmed = true;
    assert.equal(confirmAppNavigation(), true, 'accepting the prompt permits app Back');
    assert.equal(confirmations, 2);
    const approvedBack = eventWith('navigate', { navigationType: 'traverse', canIntercept: true });
    assert.equal(navigation.dispatchEvent(approvedBack), true);
    assert.equal(confirmations, 2, 'the same approved app Back does not show another prompt at traversal');
    clock += 1_000;
    confirmed = false;
    assert.equal(navigation.dispatchEvent(eventWith('navigate', { navigationType: 'traverse', canIntercept: true })), false, 'a later browser Back asks again and can be refused');
    const countBeforeUnsupported = confirmations;
    for (const fields of [{ navigationType: 'push', canIntercept: true }, { navigationType: 'traverse', canIntercept: false }]) {
      assert.equal(navigation.dispatchEvent(eventWith('navigate', fields)), true);
    }
    assert.equal(navigation.dispatchEvent(eventWith('navigate', { navigationType: 'traverse', canIntercept: true }, false)), true);
    assert.equal(confirmations, countBeforeUnsupported, 'unsupported/non-cancellable navigation is not falsely reported as guarded');

    const click = (href: string, changes: Record<string, boolean | number> = {}, anchorChanges: Partial<Pick<AnchorProbe, 'target' | 'download'>> = {}) => {
      const anchor = Object.assign(new AnchorProbe(href), anchorChanges);
      return eventWith('click', { target: new ElementProbe(anchor), button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...changes });
    };
    let routerClicks = 0;
    const routeListener = () => { routerClicks += 1; };
    documentSurface.addEventListener('click', routeListener);
    const rejectedClick = click('/development?run=other');
    assert.equal(documentSurface.dispatchEvent(rejectedClick), false);
    assert.equal(routerClicks, 0, 'cancelled capture click cannot reach the router listener');
    confirmed = true;
    assert.equal(documentSurface.dispatchEvent(click('/development?run=other')), true);
    assert.equal(routerClicks, 1);
    confirmed = false;
    const countBeforeExempt = confirmations;
    for (const allowed of [
      click('#next'), click('/development?run=current#next'),
      click('/profile', { ctrlKey: true }), click('/profile', { metaKey: true }),
      click('/profile', { shiftKey: true }), click('/profile', { altKey: true }),
      click('/profile', { button: 1 }), click('/profile', {}, { target: '_blank' }),
      click('/download', {}, { download: true }),
    ]) assert.equal(documentSurface.dispatchEvent(allowed), true);
    assert.equal(confirmations, countBeforeExempt, 'anchors and separate-tab/download gestures do not discard the current document');
    assert.equal(documentSurface.dispatchEvent(click('https://elsewhere.test/development?run=current')), false, 'a same-path different origin still leaves the form');
    documentSurface.removeEventListener('click', routeListener);

    render(first, false, true);
    const countBeforePending = confirmations;
    assert.equal(confirmAppNavigation(), false, 'pending submission blocks app navigation even with no dirty answers');
    assert.equal(documentSurface.dispatchEvent(click('/profile')), false);
    assert.equal(confirmations, countBeforePending, 'pending submission cannot be bypassed with confirm');
    const unloading = eventWith('beforeunload', { returnValue: 'initial' });
    assert.equal(windowSurface.dispatchEvent(unloading), false);
    assert.equal(Reflect.get(unloading, 'returnValue'), '');
    render(first, false, false);
    assert.equal(windowSurface.dispatchEvent(eventWith('beforeunload', { returnValue: 'initial' })), true);

    const second = probe(); mounted.push(second); render(first, true); render(second, true);
    const countBeforeMultiple = confirmations;
    assert.equal(confirmAppNavigation(), false);
    assert.equal(confirmations, countBeforeMultiple + 1, 'several dirty forms produce one confirmation per event');
    confirmed = true;
    assert.equal(confirmAppNavigation(), true);
    assert.equal(confirmations, countBeforeMultiple + 2);
    const combinedBack = eventWith('navigate', { navigationType: 'traverse', canIntercept: true });
    assert.equal(navigation.dispatchEvent(combinedBack), true);
    assert.equal(confirmations, countBeforeMultiple + 2, 'all guards share the approved traversal token');
    render(second, false, true);
    assert.equal(confirmAppNavigation(), false, 'one pending form blocks all guards without a prompt');
    assert.equal(confirmations, countBeforeMultiple + 2);
    dispose(second); render(first, false);
    assert.equal(confirmAppNavigation(), true, 'cleanup removes a formerly pending guard from the shared set');

    // A fresh pending submission must still win over a recently approved Back.
    render(first, false, true);
    assert.equal(navigation.dispatchEvent(eventWith('navigate', { navigationType: 'traverse', canIntercept: true })), false, 'a previous approval cannot bypass a newly pending submission');
    render(first, true, false);
    dispose(first);
    assert.equal(windowSurface.registrations.length, 0);
    assert.equal(documentSurface.registrations.length, 0);
    assert.equal(navigation.registrations.length, 0);
    assert.equal(confirmAppNavigation(), true, 'unmounted forms leave no stale blockers');

    Reflect.deleteProperty(windowSurface, 'navigation');
    const fallback = probe(); mounted.push(fallback); render(fallback, true);
    confirmed = false;
    assert.equal(confirmAppNavigation(), false, 'hosts without Navigation API keep app Back guards');
    assert.equal(documentSurface.dispatchEvent(click('/profile')), false, 'hosts without Navigation API keep link guards');
    dispose(fallback);
    console.log('Unsaved changes self-check passed: dirty/pending, confirm outcomes, click capture, anchors, multiple guards, Back traversal, cleanup and fallback.');
  } finally {
    mounted.forEach(dispose);
    for (const { target, key, descriptor } of originalDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
    }
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
