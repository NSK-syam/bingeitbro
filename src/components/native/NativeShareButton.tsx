'use client';

import { useIsNativeApp } from '@/lib/native/use-is-native-app';
import { shareContent } from '@/lib/native/share';
import { impactLight } from '@/lib/native/haptics';

interface NativeShareButtonProps {
  title: string;
  /** In-app path; shared as https://bingeitbro.com{path}. Defaults to the current page. */
  path?: string;
  text?: string;
  className?: string;
  /** Optional wrapper (e.g. a grid cell). Rendered only in the app, so web layout is untouched. */
  containerClassName?: string;
}

/** "Share" button that opens the OS share sheet. Renders nothing on the web. */
export function NativeShareButton({ title, path, text, className, containerClassName }: NativeShareButtonProps) {
  const native = useIsNativeApp();
  if (!native) return null;

  const handleShare = () => {
    impactLight();
    const target = path || `${window.location.pathname}${window.location.search}`;
    void shareContent({
      title,
      text: text || `Check out ${title} on BingeItBro`,
      url: target,
    });
  };

  const button = (
    <button
      type="button"
      onClick={handleShare}
      className={
        className ||
        'h-11 px-4 rounded-full border border-white/20 bg-white/10 text-[var(--text-primary)] font-semibold inline-flex items-center justify-center gap-2 hover:bg-white/15 transition-colors'
      }
      title="Share"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13" />
      </svg>
      <span className="text-sm">Share</span>
    </button>
  );
  return containerClassName ? <div className={containerClassName}>{button}</div> : button;
}
