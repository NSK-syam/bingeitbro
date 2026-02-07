import { getSupabaseAccessToken } from './supabase-rest';

export type FriendRecommendationEmailPayload = {
  recipient_id: string;
  movie_title: string;
  movie_year?: number | null;
  personal_message?: string | null;
};

export async function notifyFriendRecommendationEmails(
  recommendations: FriendRecommendationEmailPayload[],
): Promise<void> {
  if (!recommendations.length) return;

  const token = getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/api/notifications/friend-recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ recommendations }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to send email notifications.');
  }
}
