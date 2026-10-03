'use client';

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { CloseIcon } from './icons';

type SheetProps = {
  open: boolean;
  /** Called for every user dismissal (close button, backdrop, Escape, swipe down). */
  onClose: () => void;
  title: string;
  /**
   * Where focus returns on close when the opener wasn't focused (WebKit doesn't focus buttons on
   * tap, so document.activeElement is often <body> when the sheet opens).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

const FOCUSABLE = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';
const SWIPE_CLOSE_PX = 80;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

/**
 * Bottom sheet dialog. Fully controlled: it has no history or routing logic of its own. The app
 * shell drives `open` from the URL (`?sheet=recommend`), so the Android back button and browser
 * back close it through normal navigation. Traps focus while open and returns focus to the
 * element that opened it.
 */
export function Sheet({ open, onClose, title, returnFocusRef, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const opener =
      active instanceof HTMLElement && active !== document.body ? active : (returnFocusRef?.current ?? null);
    const panel = panelRef.current;
    if (panel) focusableIn(panel)[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = focusableIn(panel);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 border-0 bg-black/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[92dvh] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-[var(--app-surface)] px-5 pt-2.5"
        style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
      >
        <div
          className="flex h-6 touch-none items-center justify-center"
          aria-hidden="true"
          onPointerDown={(e) => {
            dragStartRef.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const start = dragStartRef.current;
            dragStartRef.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            if (start !== null && e.clientY - start > SWIPE_CLOSE_PX) onCloseRef.current();
          }}
          onPointerCancel={() => {
            dragStartRef.current = null;
          }}
        >
          <span className="h-[5px] w-10 rounded-full bg-[#3a3a44]" />
        </div>
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="app-display m-0 text-[30px]">{title}</h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full border-0 bg-[var(--app-raised)] text-[var(--app-text)]"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
