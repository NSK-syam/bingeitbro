import ProfilePageClient from './ProfilePageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

// One placeholder path so static export includes this route; other profile IDs load client-side
export function generateStaticParams() {
  return [{ id: 'view' }];
}

export default async function ProfilePage({ params }: PageProps) {
  const { id } = await params;
  return <ProfilePageClient userId={id} />;
}
