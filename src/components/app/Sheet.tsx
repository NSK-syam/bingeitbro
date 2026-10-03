'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
const SWIPE_CLOSE_PX = 80;

/**
 * Bottom sheet dialog. Closes on Cancel, backdrop tap, Escape, swipe down on the grabber, and the
 * Android back button / browser back (it adds a history entry while open). Traps focus while open
 * and returns focus to the element that opened it.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const historyEntryRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (historyEntryRef.current) {
      // Pop our own history entry; the popstate handler then closes the sheet.
      historyEntryRef.current = false;
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    window.history.pushState({ ...(window.history.state ?? {}), bibSheet: true }, '');
    historyEntryRef.current = true;
    const onPopState = () => {
      historyEntryRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
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
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={requestClose}
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
          onPointerDown={(e) => { dragStartRef.current = e.clientY; }}
          onPointerUp={(e) => {
            if (dragStartRef.current !== null && e.clientY - dragStartRef.current > SWIPE_CLOSE_PX) requestClose();
            dragStartRef.current = null;
          }}
          onPointerCancel={() => { dragStartRef.current = null; }}
          aria-hidden="true"
        >
          <span className="h-[5px] w-10 rounded-full bg-[#3a3a44]" />
        </div>
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="app-display m-0 text-[30px]">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
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
