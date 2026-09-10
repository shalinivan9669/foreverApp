const storageKey = 'vmeste-session-revision';
export const SESSION_CHANGED_EVENT = 'vmeste-session-changed';
let revision = 0;
let observedSubject: string | null = null;
let listening = false;

function observeOtherTabs() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    revision++;
    observedSubject = null;
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  });
}

export function sessionRevision(): number {
  observeOtherTabs();
  return revision;
}

/** Carries only a random invalidation marker, never identity or session data. */
export function announceSessionChange(): void {
  revision++;
  observedSubject = null;
  if (typeof window === 'undefined') return;
  observeOtherTabs();
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  try { window.localStorage.setItem(storageKey, crypto.randomUUID()); }
  catch { /* Embedded storage may be unavailable; focus revalidation remains required. */ }
}

export function observeSessionSubject(subject: string): void {
  if (observedSubject !== null && observedSubject !== subject) announceSessionChange();
  observedSubject = subject;
}
