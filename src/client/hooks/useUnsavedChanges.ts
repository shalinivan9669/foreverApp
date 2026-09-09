'use client';

import { useEffect, useRef } from 'react';

const NAVIGATION_EVENT = 'app:before-navigate';
type DraftState = { dirty: boolean; pending: boolean };
const draftGuards = new Set<{ current: DraftState }>();
const checkedEvents = new WeakSet<Event>();
let approvedTraverseUntil = 0;

/** Allows app buttons to use the same in-memory draft guard as links. */
export function confirmAppNavigation(): boolean {
  const accepted = window.dispatchEvent(new Event(NAVIGATION_EVENT, { cancelable: true }));
  if (accepted) approvedTraverseUntil = Date.now() + 500;
  return accepted;
}

export function useUnsavedChanges(dirty: boolean, pending = false) {
  const state = useRef({ dirty, pending });
  useEffect(() => { state.current = { dirty, pending }; }, [dirty, pending]);
  useEffect(() => {
    draftGuards.add(state);
    const check = (event: Event) => {
      if (event.defaultPrevented || checkedEvents.has(event)) return;
      checkedEvents.add(event);
      const current = [...draftGuards].map((guard) => guard.current);
      if (current.some((guard) => guard.pending) || (current.some((guard) => guard.dirty) && !window.confirm('Есть несохранённые ответы. Если уйти, этот черновик исчезнет. Уйти без сохранения?'))) event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.current.dirty && !state.current.pending) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin) return;
      check(event);
      if (event.defaultPrevented) event.stopImmediatePropagation();
    };
    // Chromium's Navigation API can cancel a same-document browser Back before
    // Next changes the route. Other hosts still have link/app Back/unload guards.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const navigationEvent = event as Event & { navigationType?: string; canIntercept?: boolean };
      if (navigationEvent.navigationType !== 'traverse' || !navigationEvent.canIntercept || !event.cancelable) return;
      if ([...draftGuards].some((guard) => guard.current.pending)) {
        approvedTraverseUntil = 0;
        check(event);
        return;
      }
      if (Date.now() < approvedTraverseUntil) { checkedEvents.add(event); approvedTraverseUntil = 0; return; }
      check(event);
    };
    window.addEventListener(NAVIGATION_EVENT, check);
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    navigation?.addEventListener('navigate', traverse);
    return () => {
      draftGuards.delete(state);
      window.removeEventListener(NAVIGATION_EVENT, check);
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      navigation?.removeEventListener('navigate', traverse);
    };
  }, []);
}
