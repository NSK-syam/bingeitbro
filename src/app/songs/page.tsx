import SongsHome from '@/features/songs/SongsHome';
import { IosReviewAccessGuard, RequireAuth } from '@/components';

export default function SongsPage() {
  return (
    <IosReviewAccessGuard fallbackHref="/movies">
      <RequireAuth>
        <SongsHome />
      </RequireAuth>
    </IosReviewAccessGuard>
  );
}
