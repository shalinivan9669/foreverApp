'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
};

// Several dialogs may be open when a form asks to discard its in-memory draft.
// Only the last closing dialog restores the document's previous scroll setting.
let scrollLocks = 0;
let previousOverflow = '';

function lockDocumentScroll() {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}

export default function Dialog({
  open,
  onClose,
  title,
  description,
  busy = false,
  children,
  footer,
  className = '',
  closeLabel = 'Закрыть окно',
  fallbackFocusRef,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const fallbackFocused = fallbackFocusRef?.current;
    const unlockScroll = lockDocumentScroll();
    // Native modal behavior makes the background inert and supports nested dialogs.
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });

    return () => {
      if (dialog.open) dialog.close();
      unlockScroll();
      // A discard action can unmount both a parent form and its confirmation.
      // Restore after all cleanup has closed the top layer, when the trigger is no longer inert.
      queueMicrotask(() => {
        const destination = previouslyFocused?.isConnected ? previouslyFocused : fallbackFocused;
        if (destination?.isConnected) destination.focus({ preventScroll: true });
      });
    };
  }, [open, fallbackFocusRef]);

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      aria-busy={busy || undefined}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.target instanceof Element && event.target.closest('dialog') !== event.currentTarget) return;
        if (event.key !== 'Tab' || !dialogRef.current) return;
        const dialog = dialogRef.current;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex]'
        )).filter((element) => element.tabIndex >= 0
          && !element.matches(':disabled, [hidden], [inert]')
          && !element.closest('[hidden], [inert]')
          && element.getClientRects().length > 0
          && window.getComputedStyle(element).visibility !== 'hidden');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) {
          event.preventDefault();
          headingRef.current?.focus();
        } else if (event.shiftKey && (document.activeElement === first
          || document.activeElement === headingRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="app-dialog-header">
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="app-heading text-lg">
          {title}
        </h2>
        <button
          type="button"
          className="app-btn-secondary app-dialog-close"
          onClick={() => { if (!busy) onClose(); }}
          disabled={busy}
          aria-label={closeLabel}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="app-dialog-content">
        {description && <p id={descriptionId} className="app-muted mb-4 text-sm">{description}</p>}
        {children}
      </div>
      {footer && <div className="app-dialog-footer">{footer}</div>}
    </dialog>
  );
}
