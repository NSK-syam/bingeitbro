import RadioHome from '@/features/radio/RadioHome';
import { RequireAuth } from '@/components';

export default function RadioPage() {
  return (
    <RequireAuth>
      <RadioHome />
    </RequireAuth>
  );
}
