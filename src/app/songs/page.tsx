import SongsHome from '@/features/songs/SongsHome';
import { RequireAuth } from '@/components';

export default function SongsPage() {
  return (
    <RequireAuth>
      <SongsHome />
    </RequireAuth>
  );
}
