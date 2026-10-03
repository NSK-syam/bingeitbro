import { EmptyState } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';

// Home: replaced by the real screen in PR 2 (Welcome and Home).
export default function AppHomePage() {
  return (
    <>
      <div className="px-5 pt-4">
        <span className="app-display text-[30px] text-[var(--app-accent)]">bib</span>
      </div>
      <EmptyState
        title="Home is being redesigned"
        body="Friend picks, tonight's schedule and trending titles arrive here in the next update."
        action={<AppButton href="/movies" variant="secondary">Open the current home</AppButton>}
      />
    </>
  );
}
