import { AppButton } from '@/components/app/AppButton';

// Welcome (signed out): replaced by the real screen in PR 2, with Apple, Google and email sign-in.
export default function AppWelcomePage() {
  return (
    <div className="flex min-h-[80dvh] flex-col justify-end gap-3 px-6 pb-10">
      <span className="app-display text-[34px] text-[var(--app-accent)]">bib</span>
      <h1 className="app-display m-0 text-[44px] leading-[0.98]">Movie picks from friends, not algorithms.</h1>
      <p className="mb-3 mt-0 text-[16px] leading-relaxed text-[var(--app-muted)]">
        Send a movie to a friend, see what they loved, and plan movie night together.
      </p>
      <AppButton href="/signup" block>Sign in</AppButton>
    </div>
  );
}
