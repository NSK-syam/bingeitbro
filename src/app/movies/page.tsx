import MoviesHome from '@/features/movies/MoviesHome';
import { RequireAuth } from '@/components';

export default function MoviesPage() {
  return (
    <RequireAuth>
      <MoviesHome />
    </RequireAuth>
  );
}
