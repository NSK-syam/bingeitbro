import { RequireAuth } from '@/components';
import AdminPicksHome from '@/features/admin-picks/AdminPicksHome';

export default function AdminPicksPage() {
  return (
    <RequireAuth>
      <AdminPicksHome />
    </RequireAuth>
  );
}
