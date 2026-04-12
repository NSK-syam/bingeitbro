# 🔌 API Reference

Complete API documentation for Binge It Bro (Cinema Chudu) platform.

---

## Table of Contents

- [Authentication](#authentication)
- [API Routes](#api-routes)
  - [POST /api/send-friend-recommendations](#post-apisend-friend-recommendations)
  - [GET /api/notifications/friend-recommendations](#get-apinotificationsfriend-recommendations)
- [TMDB API Integration](#tmdb-api-integration)
- [Supabase Database API](#supabase-database-api)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)

---

## Authentication

All authenticated API routes require a Bearer token in the `Authorization` header.

### Getting the Auth Token

```typescript
import { createClient } from '@/lib/supabase';

const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

### Using the Token

```typescript
const response = await fetch('/api/send-friend-recommendations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ ... })
});
```

---

## API Routes

### POST /api/send-friend-recommendations

Send movie recommendations to one or more friends.

**Endpoint**: `/api/send-friend-recommendations`

**Method**: `POST`

**Authentication**: Required (Bearer token)

**Rate Limit**: 50 recommendations per request

**Timeout**: 15 seconds

#### Request Body

```typescript
interface SendFriendRecommendationsRequest {
  recommendations: {
    sender_id: string;           // Must match authenticated user
    recipient_id: string;        // Friend's user ID
    recommendation_id?: string;  // Your recommendation ID (nullable)
    tmdb_id?: number;           // TMDB movie ID (nullable)
    movie_title: string;        // Movie title (max 200 chars)
    movie_poster: string;       // Poster URL (max 500 chars, must be TMDB URL)
    movie_year?: number;        // Release year (nullable)
    personal_message: string;   // Personal note (max 200 chars)
  }[];
}
```

#### Example Request

```typescript
const response = await fetch('/api/send-friend-recommendations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommendations: [
      {
        sender_id: 'user-uuid-123',
        recipient_id: 'friend-uuid-456',
        recommendation_id: 'rec-uuid-789',
        tmdb_id: 27205,
        movie_title: 'Inception',
        movie_poster: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
        movie_year: 2010,
        personal_message: 'Mind-blowing thriller! You\'ll love the ending.'
      },
      {
        sender_id: 'user-uuid-123',
        recipient_id: 'friend-uuid-789',
        tmdb_id: 550,
        movie_title: 'Fight Club',
        movie_poster: 'https://image.tmdb.org/t/p/w500/def456.jpg',
        movie_year: 1999,
        personal_message: 'This changed my life!'
      }
    ]
  })
});
```

#### Success Response

**Status Code**: `200 OK`

```typescript
interface SendFriendRecommendationsResponse {
  sent: number;                 // Number successfully sent
  sentRecipientIds: string[];   // IDs of recipients who received recs
  skipped: {
    duplicates: string[];       // Recipients with duplicate recs (23505)
    notAllowed: string[];       // Recipients not in friends list
  };
}
```

**Example**:
```json
{
  "sent": 2,
  "sentRecipientIds": ["friend-uuid-456", "friend-uuid-789"],
  "skipped": {
    "duplicates": [],
    "notAllowed": []
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Not authenticated"
}
```

**400 Bad Request**
```json
{
  "message": "Invalid JSON"
}
```

**500 Internal Server Error**
```json
{
  "message": "Server is busy. Please try again in a moment.",
  "code": "XX000"
}
```

**503 Service Unavailable**
```json
{
  "message": "Server misconfigured: missing Supabase URL or anon key"
}
```

#### Error Codes

| Code | Description | Retry? |
|------|-------------|--------|
| `23505` | Duplicate recommendation (unique constraint violation) | No (skipped) |
| `XX000` | Postgres internal error (usually OOM) | Yes (auto-retries once) |
| `401` | Authentication failed | No (re-authenticate) |
| `500` | Generic server error | Yes (after delay) |

#### Validation Rules

1. **sender_id** must match authenticated user
2. **recipient_id** must be in sender's friends list (if `SUPABASE_SERVICE_ROLE_KEY` is set)
3. **movie_title** is truncated to 200 characters
4. **movie_poster** must start with `https://image.tmdb.org/` (validated, empty if invalid)
5. **personal_message** is truncated to 200 characters
6. Maximum **50 recommendations** per request

#### Notes

- Duplicates are automatically skipped (based on `sender_id`, `recipient_id`, `recommendation_id` or `tmdb_id`)
- If `SUPABASE_SERVICE_ROLE_KEY` is set, friend relationships are validated server-side (bypasses RLS for performance)
- OOM errors (`XX000`) are automatically retried once with 800ms delay
- Non-friends are silently skipped (no error thrown)

---

### GET /api/notifications/friend-recommendations

Get unread friend recommendations for the authenticated user.

**Endpoint**: `/api/notifications/friend-recommendations`

**Method**: `GET`

**Authentication**: Required (Bearer token)

#### Request

```typescript
const response = await fetch('/api/notifications/friend-recommendations', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

#### Success Response

**Status Code**: `200 OK`

```typescript
interface FriendRecommendation {
  id: string;
  sender: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  };
  movie_title: string;
  movie_poster: string;
  movie_year?: number;
  personal_message: string;
  is_read: boolean;
  is_watched: boolean;
  created_at: string;
  tmdb_id?: string;
  recommendation_id?: string;
}

interface GetFriendRecommendationsResponse {
  recommendations: FriendRecommendation[];
  unreadCount: number;
}
```

**Example**:
```json
{
  "recommendations": [
    {
      "id": "rec-uuid-123",
      "sender": {
        "id": "user-uuid-456",
        "name": "John Doe",
        "username": "johndoe",
        "avatar": "🍿"
      },
      "movie_title": "Inception",
      "movie_poster": "https://image.tmdb.org/t/p/w500/abc123.jpg",
      "movie_year": 2010,
      "personal_message": "You'll love this!",
      "is_read": false,
      "is_watched": false,
      "created_at": "2024-01-15T12:00:00Z",
      "tmdb_id": "27205"
    }
  ],
  "unreadCount": 1
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "message": "Not authenticated"
}
```

---

### POST /api/notifications/friend-recommendations

Mark friend recommendations as read or watched.

**Endpoint**: `/api/notifications/friend-recommendations`

**Method**: `POST`

**Authentication**: Required (Bearer token)

#### Request Body

```typescript
interface UpdateFriendRecommendationRequest {
  recommendationIds: string[];  // Array of friend_recommendation IDs
  action: 'markAsRead' | 'markAsWatched';
}
```

#### Example Request

```typescript
const response = await fetch('/api/notifications/friend-recommendations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommendationIds: ['rec-uuid-123', 'rec-uuid-456'],
    action: 'markAsRead'
  })
});
```

#### Success Response

**Status Code**: `200 OK`

```json
{
  "success": true,
  "updated": 2
}
```

---

## TMDB API Integration

The Movie Database (TMDB) API wrapper is located in `src/lib/tmdb.ts`.

### Configuration

```typescript
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
```

### Methods

#### searchMovies(query, page)

Search for movies by title.

```typescript
interface TMDBSearchResult {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  genre_ids: number[];
}

async function searchMovies(
  query: string,
  page: number = 1
): Promise<TMDBSearchResult[]>
```

**Example**:
```typescript
const results = await searchMovies('Inception', 1);
// Returns array of movie objects
```

---

#### getMovieDetails(tmdbId)

Get detailed information about a specific movie.

```typescript
interface TMDBMovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  runtime: number;
  genres: { id: number; name: string }[];
  spoken_languages: { iso_639_1: string; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
}

async function getMovieDetails(tmdbId: number): Promise<TMDBMovieDetails>
```

**Example**:
```typescript
const movie = await getMovieDetails(27205);
// Returns Inception details
```

---

#### getWatchProviders(tmdbId)

Get streaming availability by region.

```typescript
interface WatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

interface WatchProvidersByRegion {
  [region: string]: {
    link: string;
    flatrate?: WatchProvider[];  // Subscription streaming
    rent?: WatchProvider[];       // Rental options
    buy?: WatchProvider[];        // Purchase options
  };
}

async function getWatchProviders(tmdbId: number): Promise<WatchProvidersByRegion>
```

**Example**:
```typescript
const providers = await getWatchProviders(27205);
// Returns:
{
  "US": {
    "link": "https://www.themoviedb.org/movie/27205-inception/watch?locale=US",
    "flatrate": [
      {
        "logo_path": "/netflix.jpg",
        "provider_id": 8,
        "provider_name": "Netflix",
        "display_priority": 1
      }
    ]
  },
  "IN": {
    "link": "https://...",
    "flatrate": [...]
  }
}
```

---

#### getTrendingMovies(timeWindow)

Get trending movies.

```typescript
type TimeWindow = 'day' | 'week';

async function getTrendingMovies(
  timeWindow: TimeWindow = 'day'
): Promise<TMDBSearchResult[]>
```

**Example**:
```typescript
const trending = await getTrendingMovies('day');
// Returns today's trending movies
```

---

#### getNewReleases(region, daysAgo)

Get OTT releases from last N days.

```typescript
async function getNewReleases(
  region: 'US' | 'IN' = 'US',
  daysAgo: number = 10
): Promise<TMDBSearchResult[]>
```

**Example**:
```typescript
const releases = await getNewReleases('IN', 10);
// Returns movies released in India in last 10 days
```

---

#### getPosterUrl(path, size)

Generate TMDB poster URL.

```typescript
type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

function getPosterUrl(path: string, size: PosterSize = 'w500'): string
```

**Example**:
```typescript
const url = getPosterUrl('/abc123.jpg', 'w500');
// Returns: "https://image.tmdb.org/t/p/w500/abc123.jpg"
```

---

#### getBackdropUrl(path, size)

Generate TMDB backdrop URL.

```typescript
type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original';

function getBackdropUrl(path: string, size: BackdropSize = 'w1280'): string
```

---

### TMDB Rate Limits

- **Free Tier**: 1,000 requests per day
- **Rate**: ~40 requests per 10 seconds
- **Exceeded**: HTTP 429 (Too Many Requests)

**Recommendation**: Implement client-side caching for popular queries.

---

## Supabase Database API

All database operations use the Supabase client from `src/lib/supabase.ts`.

### Client Setup

```typescript
import { createClient } from '@/lib/supabase';

const supabase = createClient();
```

### Query Examples

#### Get All Recommendations

```typescript
const { data, error } = await supabase
  .from('recommendations')
  .select(`
    *,
    user:users(id, name, username, avatar)
  `)
  .order('created_at', { ascending: false });
```

#### Get User's Recommendations

```typescript
const { data, error } = await supabase
  .from('recommendations')
  .select('*')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

#### Create Recommendation

```typescript
const { data, error } = await supabase
  .from('recommendations')
  .insert({
    user_id: userId,
    title: 'Inception',
    year: 2010,
    type: 'movie',
    poster: 'https://image.tmdb.org/...',
    genres: ['Action', 'Sci-Fi'],
    language: 'en',
    rating: 9.5,
    personal_note: 'Mind-blowing!',
    mood: ['epic', 'mind-bending'],
    ott_links: [
      { platform: 'Netflix', url: 'https://...', availableIn: 'US' }
    ],
    tmdb_id: 27205
  })
  .select()
  .single();
```

#### Update Recommendation

```typescript
const { data, error } = await supabase
  .from('recommendations')
  .update({ personal_note: 'Updated note' })
  .eq('id', recommendationId)
  .eq('user_id', userId);  // RLS ensures only owner can update
```

#### Delete Recommendation

```typescript
const { data, error } = await supabase
  .from('recommendations')
  .delete()
  .eq('id', recommendationId)
  .eq('user_id', userId);
```

#### Get Friends List

```typescript
const { data, error } = await supabase
  .from('friends')
  .select(`
    friend:users!friends_friend_id_fkey(
      id, name, username, avatar
    )
  `)
  .eq('user_id', userId);
```

#### Add Friend

```typescript
const { data, error } = await supabase
  .from('friends')
  .insert({
    user_id: currentUserId,
    friend_id: friendUserId
  });
```

#### Remove Friend

```typescript
const { data, error } = await supabase
  .from('friends')
  .delete()
  .eq('user_id', currentUserId)
  .eq('friend_id', friendUserId);
```

#### Get Friend Recommendations

```typescript
const { data, error } = await supabase
  .from('friend_recommendations')
  .select(`
    *,
    sender:users!friend_recommendations_sender_id_fkey(
      id, name, username, avatar
    )
  `)
  .eq('recipient_id', userId)
  .eq('is_read', false)
  .order('created_at', { ascending: false });
```

#### Mark Friend Recommendation as Read

```typescript
const { data, error } = await supabase
  .from('friend_recommendations')
  .update({ is_read: true })
  .eq('id', recommendationId)
  .eq('recipient_id', userId);
```

#### Mark Friend Recommendation as Watched

```typescript
const { data, error } = await supabase
  .from('friend_recommendations')
  .update({
    is_watched: true,
    watched_at: new Date().toISOString()
  })
  .eq('id', recommendationId)
  .eq('recipient_id', userId);
```

---

## Error Handling

### Supabase Errors

```typescript
const { data, error } = await supabase.from('recommendations').select();

if (error) {
  console.error('Supabase error:', error);
  // error.code: Postgres error code (e.g., '23505', 'XX000')
  // error.message: Human-readable error message
  // error.details: Additional error details
  // error.hint: Suggested fix
}
```

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `23505` | Unique constraint violation (duplicate) | Check if record exists first |
| `23503` | Foreign key violation | Ensure referenced record exists |
| `42501` | Insufficient privilege (RLS) | Check user permissions |
| `XX000` | Internal error (OOM) | Retry, reduce payload size |
| `PGRST116` | No rows returned (not found) | Handle empty result |

### API Route Error Handling

```typescript
try {
  const response = await fetch('/api/send-friend-recommendations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ recommendations })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('API error:', error.message);
    // Handle specific status codes
    if (response.status === 401) {
      // Re-authenticate user
    } else if (response.status === 500) {
      // Retry or show generic error
    }
  }

  const data = await response.json();
  // Success
} catch (err) {
  console.error('Network error:', err);
  // Handle network failures
}
```

---

## Rate Limits

### TMDB API
- **Free Tier**: 1,000 requests/day
- **Rate**: ~40 requests/10 seconds
- **Headers**: Check `X-RateLimit-Remaining` header

### Supabase
- **Free Tier**:
  - 50,000 monthly active users
  - 500 MB database
  - 1 GB file storage
  - 2 GB bandwidth
- **Realtime**: 200 concurrent connections
- **Edge Functions**: 500,000 invocations/month

### Next.js API Routes (Vercel)
- **Hobby Plan**:
  - 100 GB bandwidth/month
  - 100 hours serverless execution
  - 10 second function timeout
- **Pro Plan**: Higher limits

### Recommended Practices

1. **Cache TMDB responses** (localStorage for 1 hour)
2. **Debounce search queries** (300ms minimum)
3. **Batch API calls** (use `.insert([...])` instead of multiple `.insert()`)
4. **Use RLS policies** (reduces server-side validation)
5. **Implement exponential backoff** for retries

---

## Example: Complete Friend Recommendation Flow

```typescript
// 1. Get auth token
const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// 2. Get friends list
const { data: friends } = await supabase
  .from('friends')
  .select('friend:users!friends_friend_id_fkey(id, name, username)')
  .eq('user_id', session.user.id);

// 3. Get recommendation to send
const { data: recommendation } = await supabase
  .from('recommendations')
  .select('*')
  .eq('id', recommendationId)
  .single();

// 4. Send to selected friends
const response = await fetch('/api/send-friend-recommendations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recommendations: selectedFriends.map(friend => ({
      sender_id: session.user.id,
      recipient_id: friend.id,
      recommendation_id: recommendation.id,
      tmdb_id: recommendation.tmdb_id,
      movie_title: recommendation.title,
      movie_poster: recommendation.poster,
      movie_year: recommendation.year,
      personal_message: personalMessage
    }))
  })
});

const result = await response.json();
console.log(`Sent to ${result.sent} friends`);
```

---

## GraphQL Alternative (Future)

Currently, the platform uses REST APIs. For future GraphQL support:

```graphql
# Example GraphQL query (not yet implemented)
query GetRecommendations($userId: UUID!) {
  recommendations(where: { user_id: { _eq: $userId } }) {
    id
    title
    year
    poster
    user {
      name
      avatar
    }
  }
}
```

Consider using **Hasura** or **PostGraphile** with Supabase PostgreSQL for GraphQL support.

---

**Last Updated**: January 2024
