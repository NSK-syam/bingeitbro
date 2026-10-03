'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_GROUPS, APP_HOME, APP_ME, APP_PICKS } from '@/lib/native/app-routes';
import { GroupsIcon, HomeIcon, MeIcon, PicksIcon, PlusIcon } from './icons';

const TABS = [
  { href: APP_HOME, label: 'Home', Icon: HomeIcon },
  { href: APP_PICKS, label: 'Picks', Icon: PicksIcon },
  { href: APP_GROUPS, label: 'Groups', Icon: GroupsIcon },
  { href: APP_ME, label: 'Me', Icon: MeIcon },
] as const;

export const TAB_PATHS: readonly string[] = TABS.map((t) => t.href);

function TabLink({ href, label, Icon, active }: { href: string; label: string; Icon: typeof HomeIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 min-w-14 flex-col items-center gap-[3px] text-[11px] no-underline ${
        active ? 'text-[var(--app-accent)]' : 'text-[#8a8a94]'
      }`}
    >
      <Icon />
      {label}
    </Link>
  );
}

/**
 * Bottom bar: four navigation tabs with a centred Recommend action. The action is a button that
 * opens a sheet, not a tab, so it never gets aria-current.
 */
export function TabBar({ onRecommend }: { onRecommend: () => void }) {
  const pathname = usePathname();
  const [home, picks, groups, me] = TABS;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex items-start justify-around border-t border-[#1f1f25] bg-[#0e0e12] pt-2"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <TabLink {...home} active={pathname === home.href} />
      <TabLink {...picks} active={pathname === picks.href} />
      <button
        type="button"
        onClick={onRecommend}
        aria-label="Recommend a movie"
        aria-haspopup="dialog"
        className="flex h-12 w-12 items-center justify-center rounded-2xl border-0 bg-[var(--app-accent)] text-[var(--app-on-accent)]"
      >
        <PlusIcon />
      </button>
      <TabLink {...groups} active={pathname === groups.href} />
      <TabLink {...me} active={pathname === me.href} />
    </nav>
  );
}
