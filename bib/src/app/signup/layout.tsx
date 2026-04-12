import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create your BiB account to save friend movie and show recommendations, watchlists, and reminders.',
  alternates: {
    canonical: '/signup',
  },
  openGraph: {
    title: 'Sign Up | BiB - Binge it bro',
    description: 'Create your BiB account and start saving friend recommendations in seconds.',
    url: '/signup',
  },
  twitter: {
    title: 'Sign Up | BiB - Binge it bro',
    description: 'Create your BiB account and start saving friend recommendations in seconds.',
  },
};

export default function SignupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
