import ShowsHome from '@/features/shows/ShowsHome';
import { RequireAuth } from '@/components';

export default function ShowsPage() {
  return (
    <RequireAuth>
      <ShowsHome />
    </RequireAuth>
  );
}
