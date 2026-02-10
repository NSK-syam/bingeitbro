# 🧩 Component Library Documentation

Complete reference for all React components in Binge It Bro (Cinema Chudu).

---

## Table of Contents

- [Core Components](#core-components)
- [Modal Components](#modal-components)
- [Feature Components](#feature-components)
- [UI Components](#ui-components)
- [Layout Components](#layout-components)
- [Component Patterns](#component-patterns)
- [Custom Hooks](#custom-hooks)
- [Styling Guide](#styling-guide)

---

## Core Components

### AuthProvider

**Location**: `src/components/AuthProvider.tsx`

**Purpose**: Global authentication context provider with login/signup logic.

**Props**: None (wraps entire app in `src/app/layout.tsx`)

**Context Value**:
```typescript
interface AuthContextValue {
  user: User | null;
  profile: DBUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, username: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}
```

**Usage**:
```tsx
import { useAuth } from '@/components/AuthProvider';

function MyComponent() {
  const { user, login, logout } = useAuth();

  if (!user) {
    return <button onClick={() => login('email@example.com', 'password')}>Login</button>;
  }

  return <button onClick={logout}>Logout</button>;
}
```

**Features**:
- Email/password authentication
- Google OAuth (PKCE flow)
- Session persistence
- Auto-refresh tokens
- Profile loading (joins with `users` table)
- Loading states

**State Management**:
```typescript
const [user, setUser] = useState<User | null>(null);
const [profile, setProfile] = useState<DBUser | null>(null);
const [loading, setLoading] = useState(true);
```

---

### Header

**Location**: `src/components/Header.tsx`

**Purpose**: Main navigation bar with search, user menu, and notifications.

**Props**:
```typescript
interface HeaderProps {
  onOpenSubmitModal?: () => void;
  onOpenFriendsManager?: () => void;
  onOpenFriendRecommendations?: () => void;
  unreadFriendRecsCount?: number;
}
```

**Usage**:
```tsx
<Header
  onOpenSubmitModal={() => setShowSubmitModal(true)}
  onOpenFriendsManager={() => setShowFriendsManager(true)}
  onOpenFriendRecommendations={() => setShowFriendRecs(true)}
  unreadFriendRecsCount={5}
/>
```

**Features**:
- **Search Bar**: Autocomplete search with TMDB API
  - Debounced input (300ms)
  - Keyboard navigation (arrow keys, Enter)
  - Click outside to close
- **User Menu**: Dropdown with profile, settings, logout
- **Notifications Badge**: Unread friend recommendations count
- **Add Movie Button**: Opens submit recommendation modal
- **Responsive**: Collapses to hamburger menu on mobile

**Search Implementation**:
```typescript
const [searchQuery, setSearchQuery] = useState('');
const [searchResults, setSearchResults] = useState<TMDBSearchResult[]>([]);

const debouncedSearch = useCallback(
  debounce(async (query: string) => {
    if (query.length >= 2) {
      const results = await searchMovies(query);
      setSearchResults(results.slice(0, 8)); // Max 8 results
    } else {
      setSearchResults([]);
    }
  }, 300),
  []
);
```

---

### MovieCard

**Location**: `src/components/MovieCard.tsx`

**Purpose**: Display movie/series recommendation card with actions.

**Props**:
```typescript
interface MovieCardProps {
  recommendation: DBRecommendation;
  onSendToFriend?: (rec: DBRecommendation) => void;
  onDelete?: (id: string) => void;
  showUser?: boolean;  // Show recommender info
  compact?: boolean;   // Smaller card variant
}
```

**Usage**:
```tsx
<MovieCard
  recommendation={rec}
  onSendToFriend={(rec) => openSendModal(rec)}
  onDelete={(id) => deleteRecommendation(id)}
  showUser={true}
  compact={false}
/>
```

**Features**:
- **Poster Image**: TMDB poster with fallback
- **Title & Year**: Movie title with release year
- **Genres**: Genre badges (max 3)
- **Rating**: User rating (1-10) with stars
- **Personal Note**: User's review/recommendation
- **Mood Tags**: Mood badges (epic, thrilling, etc.)
- **OTT Links**: Streaming platform buttons
- **Actions**:
  - 👁️ Watched button (toggle watched status)
  - 📋 Watchlist button (add to watchlist)
  - ➡️ Send to Friend (opens SendToFriendModal)
  - 🗑️ Delete (only for owner)
- **User Info**: Recommender avatar and name (if `showUser={true}`)

**Layout**:
```
┌──────────────────────────┐
│  [Poster Image]          │
│                          │
│  Title (Year)            │
│  ⭐⭐⭐⭐⭐ 9.5/10        │
│                          │
│  [Genre] [Genre]         │
│  [Mood] [Mood]           │
│                          │
│  "Personal note here..." │
│                          │
│  [Netflix] [Prime Video] │
│                          │
│  [👁️] [📋] [➡️] [🗑️]    │
│                          │
│  🍿 John Doe             │
└──────────────────────────┘
```

---

## Modal Components

### AuthModal

**Location**: `src/components/AuthModal.tsx`

**Purpose**: Login/signup modal with email and Google OAuth.

**Props**:
```typescript
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'signup';
}
```

**Usage**:
```tsx
const [showAuthModal, setShowAuthModal] = useState(false);

<AuthModal
  isOpen={showAuthModal}
  onClose={() => setShowAuthModal(false)}
  defaultTab="signup"
/>
```

**Features**:
- **Tabs**: Switch between Login and Signup
- **Email/Password**: Traditional authentication
- **Google OAuth**: One-click Google login
- **Validation**: Email format, password strength, username availability
- **Error Handling**: Display auth errors (wrong password, email exists, etc.)
- **Loading States**: Disable buttons during auth

**Form Fields**:
- **Login**: Email, Password
- **Signup**: Name, Email, Username, Password, Confirm Password

**Signup Flow**:
1. User enters details
2. Check username availability
3. Create auth user (`supabase.auth.signUp`)
4. Create user profile (`users` table insert via database trigger)
5. Auto-login
6. Close modal

---

### SubmitRecommendation

**Location**: `src/components/SubmitRecommendation.tsx`

**Purpose**: Add new movie/series recommendation form with TMDB search.

**Props**:
```typescript
interface SubmitRecommendationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}
```

**Usage**:
```tsx
<SubmitRecommendation
  isOpen={showSubmitModal}
  onClose={() => setShowSubmitModal(false)}
  onSuccess={() => {
    refreshRecommendations();
    toast.success('Recommendation added!');
  }}
/>
```

**Features**:
- **TMDB Search**: Autocomplete movie search
- **Movie Details**: Auto-filled from TMDB (title, year, poster, genres, runtime)
- **Custom Fields**:
  - Type (movie, series, documentary, anime)
  - Personal note (why you recommend it)
  - Rating (1-10 slider)
  - Mood tags (epic, thrilling, heartwarming, etc.)
  - Watch context (alone, with friends, with partner)
  - OTT links (platform selector + URL input)
- **Validation**: Required fields, URL format
- **Multi-Step**: Search → Details → Submit

**Form Layout**:
```
┌─────────────────────────────────┐
│  Step 1: Search Movie           │
│  [Search TMDB...]               │
│  ┌─────────────────┐            │
│  │ [Poster] Title  │ ← Click    │
│  └─────────────────┘            │
│                                 │
│  Step 2: Add Details            │
│  Type: [Movie ▼]                │
│  Rating: ⭐⭐⭐⭐⭐ (9/10)        │
│  Mood: [✓ Epic] [✓ Thrilling]  │
│  Watch With: [Alone ▼]          │
│  Personal Note:                 │
│  ┌─────────────────────────┐   │
│  │ "Amazing movie because...│   │
│  └─────────────────────────┘   │
│  OTT Links:                     │
│  [Netflix ▼] [URL input]        │
│  [+ Add Platform]               │
│                                 │
│  [Cancel] [Submit]              │
└─────────────────────────────────┘
```

**State Management**:
```typescript
const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);
const [personalNote, setPersonalNote] = useState('');
const [rating, setRating] = useState(8);
const [moods, setMoods] = useState<string[]>([]);
const [watchWith, setWatchWith] = useState('alone');
const [ottLinks, setOttLinks] = useState<OTTLink[]>([]);
```

---

### SendToFriendModal

**Location**: `src/components/SendToFriendModal.tsx`

**Purpose**: Send movie recommendation to one or more friends.

**Props**:
```typescript
interface SendToFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: DBRecommendation | TMDBMovie;
  friends?: Friend[];
}
```

**Usage**:
```tsx
<SendToFriendModal
  isOpen={showSendModal}
  onClose={() => setShowSendModal(false)}
  recommendation={selectedRecommendation}
  friends={friendsList}
/>
```

**Features**:
- **Friends List**: Checkbox list of friends
- **Select All**: Bulk select/deselect
- **Personal Message**: Optional note to friends
- **Preview**: Show movie poster and title
- **Batch Send**: Send to multiple friends at once
- **Success Feedback**: Toast notification

**Layout**:
```
┌─────────────────────────────────┐
│  Send "Inception" to Friends    │
│                                 │
│  [Poster] Inception (2010)      │
│                                 │
│  Select Friends:                │
│  ┌─────────────────────────┐   │
│  │ [✓] Select All          │   │
│  │ [ ] John Doe            │   │
│  │ [✓] Jane Smith          │   │
│  │ [✓] Bob Johnson         │   │
│  └─────────────────────────┘   │
│                                 │
│  Personal Message (optional):   │
│  ┌─────────────────────────┐   │
│  │ "You'll love this!"     │   │
│  └─────────────────────────┘   │
│                                 │
│  [Cancel] [Send to 2 Friends]   │
└─────────────────────────────────┘
```

**Send Logic**:
```typescript
const handleSend = async () => {
  const response = await fetch('/api/send-friend-recommendations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      recommendations: selectedFriends.map(friend => ({
        sender_id: user.id,
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
  toast.success(`Sent to ${result.sent} friends!`);
  onClose();
};
```

---

### FriendRecommendationsModal

**Location**: `src/components/FriendRecommendationsModal.tsx`

**Purpose**: View recommendations received from friends (inbox).

**Props**:
```typescript
interface FriendRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Usage**:
```tsx
<FriendRecommendationsModal
  isOpen={showFriendRecs}
  onClose={() => setShowFriendRecs(false)}
/>
```

**Features**:
- **Inbox View**: List of received recommendations
- **Friend Info**: Sender avatar and name
- **Personal Message**: Friend's note
- **Movie Details**: Poster, title, year
- **Actions**:
  - Mark as Read
  - Mark as Watched
  - Add to Watchlist
  - View Movie Details
- **Filters**: Unread, Watched, All
- **Empty State**: "No recommendations yet"

**Layout**:
```
┌─────────────────────────────────┐
│  Friend Recommendations (5)     │
│  [Unread] [Watched] [All]       │
│                                 │
│  ┌───────────────────────────┐ │
│  │ 🍿 John Doe · 2 hours ago │ │
│  │ [Poster] Inception (2010) │ │
│  │ "You'll love this!"       │ │
│  │ [👁️ Mark Watched] [📋]    │ │
│  └───────────────────────────┘ │
│                                 │
│  ┌───────────────────────────┐ │
│  │ 🎬 Jane · Yesterday       │ │
│  │ [Poster] The Matrix       │ │
│  │ "Mind-blowing!"           │ │
│  │ [👁️ Mark Watched] [📋]    │ │
│  └───────────────────────────┘ │
│                                 │
│  [Close]                        │
└─────────────────────────────────┘
```

---

### FriendsManager

**Location**: `src/components/FriendsManager.tsx`

**Purpose**: Add/remove friends, view friends list.

**Props**:
```typescript
interface FriendsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Usage**:
```tsx
<FriendsManager
  isOpen={showFriendsManager}
  onClose={() => setShowFriendsManager(false)}
/>
```

**Features**:
- **Add Friend**: Search by username
- **Friends List**: All current friends
- **Remove Friend**: Unfriend button
- **Username Search**: Real-time username lookup
- **Validation**: Can't add self, duplicate friends
- **Empty State**: "No friends yet"

**Layout**:
```
┌─────────────────────────────────┐
│  Manage Friends                 │
│                                 │
│  Add Friend:                    │
│  [Search username...]           │
│  ┌─────────────────────────┐   │
│  │ 🍿 johndoe (John Doe)   │   │
│  │ [+ Add Friend]          │   │
│  └─────────────────────────┘   │
│                                 │
│  Your Friends (3):              │
│  ┌─────────────────────────┐   │
│  │ 🎬 Jane Smith           │   │
│  │ @janesmith              │   │
│  │ [Unfriend]              │   │
│  ├─────────────────────────┤   │
│  │ 🍕 Bob Johnson          │   │
│  │ @bobjohnson             │   │
│  │ [Unfriend]              │   │
│  └─────────────────────────┘   │
│                                 │
│  [Close]                        │
└─────────────────────────────────┘
```

**Add Friend Logic**:
```typescript
const handleAddFriend = async (username: string) => {
  // 1. Find user by username
  const { data: user } = await supabase
    .from('users')
    .select('id, name, username, avatar')
    .eq('username', username)
    .single();

  if (!user) {
    toast.error('User not found');
    return;
  }

  // 2. Add friend relationship
  const { error } = await supabase
    .from('friends')
    .insert({
      user_id: currentUser.id,
      friend_id: user.id
    });

  if (error?.code === '23505') {
    toast.error('Already friends');
  } else {
    toast.success(`Added ${user.name} as friend!`);
    refreshFriendsList();
  }
};
```

---

### WatchlistModal

**Location**: `src/components/WatchlistModal.tsx`

**Purpose**: View and manage personal watchlist.

**Props**:
```typescript
interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Features**:
- **Watchlist Items**: Movies added to watchlist
- **Remove from Watchlist**: Click to remove
- **Mark as Watched**: Quick action
- **Empty State**: "Your watchlist is empty"
- **LocalStorage**: Persisted locally (progressive sync to Supabase)

---

### NudgesModal

**Location**: `src/components/NudgesModal.tsx`

**Purpose**: View unwatched friend recommendations (reminders).

**Props**:
```typescript
interface NudgesModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Features**:
- **Unwatched Recommendations**: Friend recs not yet watched
- **Age Filter**: Show oldest first
- **Quick Actions**: Mark watched, add to watchlist
- **Badge Count**: Number of unwatched

---

### TodayReleasesModal

**Location**: `src/components/TodayReleasesModal.tsx`

**Purpose**: View new OTT releases from last 10 days.

**Props**:
```typescript
interface TodayReleasesModalProps {
  isOpen: boolean;
  onClose: () => void;
}
```

**Features**:
- **Recent Releases**: Movies/series released in last 10 days
- **Region Filter**: USA and India
- **OTT Only**: Filters out theatrical releases
- **TMDB Integration**: Live data from TMDB API

---

### AvatarPickerModal

**Location**: `src/components/AvatarPickerModal.tsx`

**Purpose**: Select emoji avatar for user profile.

**Props**:
```typescript
interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentAvatar?: string;
}
```

**Avatars Available**:
```typescript
const avatars = [
  '🍿', '🎬', '🎥', '🎞️', '📽️', '🎭', '🍕', '🍔', '🍟', '🌮',
  '🍣', '🍱', '🍜', '🍝', '🍰', '🎂', '🍩', '🍪', '☕', '🍺',
  '🎮', '🎯', '🎲', '🎸', '🎹', '🎺', '🎻', '🥁', '🎧', '🎤',
  '🚀', '🛸', '🌍', '🌙', '⭐', '🔥', '💎', '🏆', '👑', '🎁'
];
```

---

## Feature Components

### FilterBar

**Location**: `src/components/FilterBar.tsx`

**Purpose**: Filter recommendations by type, genre, language, year, etc.

**Props**:
```typescript
interface FilterBarProps {
  onFilterChange: (filters: Filters) => void;
}

interface Filters {
  type?: 'movie' | 'series' | 'documentary' | 'anime' | 'all';
  genre?: string;
  language?: string;
  year?: number;
  recommender?: string;
  watchStatus?: 'all' | 'watched' | 'unwatched';
}
```

**Usage**:
```tsx
<FilterBar
  onFilterChange={(filters) => {
    setFilters(filters);
    applyFilters(filters);
  }}
/>
```

**Filters Available**:
- **Type**: Movie, Series, Documentary, Anime, All
- **Genre**: Action, Comedy, Drama, Sci-Fi, Thriller, etc.
- **Language**: English, Telugu, Hindi, Tamil, Malayalam, etc.
- **Year**: 2024, 2023, 2022, etc.
- **Recommender**: Filter by friend
- **Watch Status**: All, Watched, Unwatched

---

### TrendingMovies

**Location**: `src/components/TrendingMovies.tsx`

**Purpose**: Display trending movies from TMDB.

**Props**:
```typescript
interface TrendingMoviesProps {
  region?: 'US' | 'IN';
  timeWindow?: 'day' | 'week';
  limit?: number;
}
```

**Features**:
- **TMDB Integration**: Live trending data
- **Region Filter**: USA or India
- **Time Window**: Daily or weekly
- **Horizontal Scroll**: Carousel layout
- **Click to Details**: Navigate to movie page

---

### RandomPicker

**Location**: `src/components/RandomPicker.tsx`

**Purpose**: Pick a random movie from friends' recommendations.

**Props**:
```typescript
interface RandomPickerProps {
  recommendations: DBRecommendation[];
}
```

**Features**:
- **Slot Machine Effect**: Animated random picker
- **Filters**: Can filter by genre, language before picking
- **Result**: Shows picked movie with details
- **Reroll**: Pick again

**Usage**:
```tsx
<RandomPicker recommendations={friendsRecommendations} />
```

---

### WatchedButton

**Location**: `src/components/WatchedButton.tsx`

**Purpose**: Toggle watched status for a movie.

**Props**:
```typescript
interface WatchedButtonProps {
  movieId: string;
  initialWatched?: boolean;
  onToggle?: (watched: boolean) => void;
}
```

**Usage**:
```tsx
<WatchedButton
  movieId={recommendation.id}
  initialWatched={isWatched}
  onToggle={(watched) => {
    console.log(`Marked as ${watched ? 'watched' : 'unwatched'}`);
  }}
/>
```

**Features**:
- **Optimistic Update**: Instant UI feedback
- **LocalStorage**: Persistent across sessions
- **Supabase Sync**: Background sync (progressive enhancement)
- **Icon States**: 👁️ (watched) vs 👁️‍🗨️ (unwatched)

---

### WatchlistButton

**Location**: `src/components/WatchlistButton.tsx`

**Purpose**: Add/remove movie from watchlist.

**Props**:
```typescript
interface WatchlistButtonProps {
  movieId: string;
  initialInWatchlist?: boolean;
  onToggle?: (inWatchlist: boolean) => void;
}
```

**Features**:
- **LocalStorage**: Instant save
- **Icon States**: 📋 (in watchlist) vs 📋 (not in watchlist)
- **Tooltip**: "Add to Watchlist" / "Remove from Watchlist"

---

### ReactionBar

**Location**: `src/components/ReactionBar.tsx`

**Purpose**: Emoji reactions for recommendations (like Facebook reactions).

**Props**:
```typescript
interface ReactionBarProps {
  recommendationId: string;
  reactions?: Reaction[];
}

interface Reaction {
  emoji: string;
  count: number;
  userReacted: boolean;
}
```

**Reactions Available**:
```
👍 Like
❤️ Love
😂 Haha
😮 Wow
😢 Sad
😡 Angry
🔥 Fire
🎯 Bullseye
```

---

### RecommendationToast

**Location**: `src/components/RecommendationToast.tsx`

**Purpose**: Toast notification for new friend recommendations.

**Props**:
```typescript
interface RecommendationToastProps {
  sender: { name: string; avatar: string };
  movieTitle: string;
  onView: () => void;
}
```

**Features**:
- **Auto-dismiss**: 5 seconds
- **Click to View**: Opens FriendRecommendationsModal
- **Sound**: Optional notification sound
- **Badge Update**: Updates unread count

---

### DailyQuoteBanner

**Location**: `src/components/DailyQuoteBanner.tsx`

**Purpose**: Display daily movie quote at top of page.

**Props**: None (auto-selects quote)

**Features**:
- **Daily Rotation**: New quote each day
- **LocalStorage**: Remember shown quote
- **Dismissible**: Close button
- **Fade Animation**: Smooth appearance

**Example Quotes**:
```
"May the Force be with you." – Star Wars
"I'll be back." – The Terminator
"Here's looking at you, kid." – Casablanca
```

---

### OnboardingTour

**Location**: `src/components/OnboardingTour.tsx`

**Purpose**: First-time user walkthrough.

**Props**:
```typescript
interface OnboardingTourProps {
  onComplete: () => void;
}
```

**Steps**:
1. **Welcome**: Introduction to platform
2. **Add Recommendation**: How to submit
3. **Send to Friend**: How to share
4. **Trending**: Discover new content
5. **Profile**: Customize profile

**Features**:
- **Spotlight**: Highlights target element
- **Next/Skip**: Navigate through steps
- **LocalStorage**: Don't show again

---

### BibSplash

**Location**: `src/components/BibSplash.tsx`

**Purpose**: Animated intro splash screen.

**Props**:
```typescript
interface BibSplashProps {
  onComplete: () => void;
}
```

**Features**:
- **Popcorn Animation**: Animated popcorn logo
- **Fade Out**: 2-second animation
- **Auto-dismiss**: Hides after 3 seconds
- **First Visit Only**: Only shows on first visit

---

### MovieBackground

**Location**: `src/components/MovieBackground.tsx`

**Purpose**: Dynamic background effect with movie posters.

**Props**:
```typescript
interface MovieBackgroundProps {
  posters?: string[];
}
```

**Features**:
- **Parallax Effect**: Background scrolls slower
- **Blur & Overlay**: Subtle backdrop
- **Random Posters**: Rotates through provided posters

---

## Custom Hooks

### useAuth()

**Location**: `src/components/AuthProvider.tsx`

**Purpose**: Access authentication state and methods.

**Returns**:
```typescript
{
  user: User | null;
  profile: DBUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email, password, name, username) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}
```

**Usage**:
```tsx
const { user, profile, logout } = useAuth();

if (user) {
  return <div>Welcome, {profile?.name}! <button onClick={logout}>Logout</button></div>;
}
```

---

### useWatched(movieId)

**Location**: `src/hooks/useWatched.ts`

**Purpose**: Track watched status for a movie.

**Returns**:
```typescript
{
  isWatched: boolean;
  toggleWatched: () => void;
  watchedAt: Date | null;
}
```

**Usage**:
```tsx
const { isWatched, toggleWatched } = useWatched(recommendation.id);

<button onClick={toggleWatched}>
  {isWatched ? '👁️ Watched' : '👁️‍🗨️ Mark Watched'}
</button>
```

**Storage**: Uses `cinema-chudu-watched` in localStorage.

---

### useWatchlist(movieId)

**Location**: `src/hooks/useWatchlist.ts`

**Purpose**: Manage watchlist status for a movie.

**Returns**:
```typescript
{
  inWatchlist: boolean;
  addToWatchlist: () => void;
  removeFromWatchlist: () => void;
  toggleWatchlist: () => void;
}
```

---

### useNudges()

**Location**: `src/hooks/useNudges.ts`

**Purpose**: Get unwatched friend recommendations.

**Returns**:
```typescript
{
  nudges: FriendRecommendation[];
  unreadCount: number;
  refresh: () => Promise<void>;
}
```

---

### useLocalStorage(key, initialValue)

**Location**: `src/hooks/useLocalStorage.ts`

**Purpose**: Typed localStorage hook with React state sync.

**Usage**:
```tsx
const [watchlist, setWatchlist] = useLocalStorage<string[]>('cinema-chudu-watchlist', []);

// Add to watchlist
setWatchlist([...watchlist, movieId]);

// Remove from watchlist
setWatchlist(watchlist.filter(id => id !== movieId));
```

---

## Component Patterns

### Compound Components

Used for complex components with sub-components (e.g., FilterBar).

```tsx
<FilterBar>
  <FilterBar.TypeFilter />
  <FilterBar.GenreFilter />
  <FilterBar.LanguageFilter />
</FilterBar>
```

---

### Render Props

Used for flexible rendering (e.g., MovieCard with custom actions).

```tsx
<MovieCard
  recommendation={rec}
  renderActions={(rec) => (
    <>
      <button onClick={() => share(rec)}>Share</button>
      <button onClick={() => delete(rec)}>Delete</button>
    </>
  )}
/>
```

---

### Higher-Order Components (HOCs)

Used for authentication guards.

```tsx
const withAuth = (Component) => {
  return (props) => {
    const { user, loading } = useAuth();

    if (loading) return <Spinner />;
    if (!user) return <Navigate to="/login" />;

    return <Component {...props} />;
  };
};

export default withAuth(ProfilePage);
```

---

## Styling Guide

### Tailwind CSS Classes

**Common Patterns**:

```tsx
// Card
className="rounded-lg shadow-md p-4 bg-white dark:bg-gray-800"

// Button Primary
className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold"

// Button Secondary
className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg"

// Input
className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"

// Modal Backdrop
className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"

// Modal Container
className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
```

### Dark Mode

All components support dark mode via `dark:` prefix.

```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  Content
</div>
```

### Responsive Design

Mobile-first approach with breakpoints:

```tsx
<div className="
  grid
  grid-cols-1        /* Mobile: 1 column */
  sm:grid-cols-2     /* Tablet: 2 columns */
  lg:grid-cols-3     /* Desktop: 3 columns */
  gap-4
">
  {/* MovieCards */}
</div>
```

---

**Last Updated**: January 2024
