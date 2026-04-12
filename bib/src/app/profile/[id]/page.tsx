import ProfilePageClient from './ProfilePageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Placeholder + fallback so static export includes the route; Vercel rewrites unknown /profile/:id to fallback
export function generateStaticParams() {
  return [{ id: 'view' }, { id: 'fallback' }];
}

export default async function ProfilePage({ params }: PageProps) {
  const { id } = await params;
  return <ProfilePageClient userId={id} />;
}
