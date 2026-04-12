# 🧪 Testing Guide

Comprehensive testing guide for Binge It Bro (Cinema Chudu) platform.

---

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Testing Setup](#testing-setup)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [End-to-End Testing](#end-to-end-testing)
- [Manual Testing](#manual-testing)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)
- [Testing Checklist](#testing-checklist)

---

## Testing Philosophy

### Current State

The platform currently relies on **manual testing** and **production monitoring**. This guide provides a roadmap for implementing automated testing.

### Testing Pyramid

```
        /\
       /E2E\       ← Few (10%) - User flows
      /------\
     /  INT   \    ← Some (30%) - API + DB
    /----------\
   /    UNIT    \  ← Many (60%) - Functions + Components
  /--------------\
```

### Goals

1. **Confidence**: Catch bugs before production
2. **Speed**: Fast feedback loop (<5 minutes)
3. **Reliability**: Tests don't flake
4. **Maintainability**: Easy to update tests

---

## Testing Setup

### 1. Install Testing Libraries

```bash
npm install --save-dev \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  vitest \
  @vitest/ui \
  jsdom
```

### 2. Create Vitest Config

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 3. Create Test Setup File

**File**: `src/test/setup.ts`

```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}));

// Mock TMDB API
vi.mock('@/lib/tmdb', () => ({
  searchMovies: vi.fn(),
  getMovieDetails: vi.fn(),
  getWatchProviders: vi.fn(),
  getTrendingMovies: vi.fn(),
}));

// Mock window.matchMedia (for dark mode tests)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

### 4. Add Test Scripts to package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test"
  }
}
```

---

## Unit Testing

### Testing Utility Functions

**File**: `src/lib/tmdb.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchMovies, getPosterUrl, getBackdropUrl } from './tmdb';

describe('TMDB API', () => {
  describe('searchMovies', () => {
    it('should return search results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { id: 27205, title: 'Inception', release_date: '2010-07-16' },
          ],
        }),
      });

      const results = await searchMovies('Inception');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Inception');
      expect(results[0].id).toBe(27205);
    });

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(searchMovies('Inception')).rejects.toThrow('Network error');
    });

    it('should handle empty query', async () => {
      const results = await searchMovies('');

      expect(results).toEqual([]);
    });
  });

  describe('getPosterUrl', () => {
    it('should generate correct poster URL', () => {
      const url = getPosterUrl('/abc123.jpg', 'w500');

      expect(url).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg');
    });

    it('should use default size', () => {
      const url = getPosterUrl('/abc123.jpg');

      expect(url).toContain('/w500/');
    });

    it('should handle null path', () => {
      const url = getPosterUrl(null);

      expect(url).toBe('');
    });
  });
});
```

---

### Testing Custom Hooks

**File**: `src/hooks/useWatched.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWatched } from './useWatched';

describe('useWatched', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with unwatched state', () => {
    const { result } = renderHook(() => useWatched('movie-123'));

    expect(result.current.isWatched).toBe(false);
    expect(result.current.watchedAt).toBeNull();
  });

  it('should toggle watched status', () => {
    const { result } = renderHook(() => useWatched('movie-123'));

    act(() => {
      result.current.toggleWatched();
    });

    expect(result.current.isWatched).toBe(true);
    expect(result.current.watchedAt).toBeInstanceOf(Date);
  });

  it('should persist to localStorage', () => {
    const { result } = renderHook(() => useWatched('movie-123'));

    act(() => {
      result.current.toggleWatched();
    });

    const stored = JSON.parse(localStorage.getItem('cinema-chudu-watched') || '{}');
    expect(stored['movie-123'].watched).toBe(true);
  });

  it('should restore from localStorage', () => {
    localStorage.setItem(
      'cinema-chudu-watched',
      JSON.stringify({
        'movie-123': { watched: true, watchedAt: '2024-01-15T12:00:00Z' },
      })
    );

    const { result } = renderHook(() => useWatched('movie-123'));

    expect(result.current.isWatched).toBe(true);
  });
});
```

---

### Testing React Components

**File**: `src/components/MovieCard.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MovieCard } from './MovieCard';
import { DBRecommendation } from '@/lib/supabase';

const mockRecommendation: DBRecommendation = {
  id: 'rec-123',
  user_id: 'user-456',
  title: 'Inception',
  year: 2010,
  type: 'movie',
  poster: 'https://image.tmdb.org/t/p/w500/abc123.jpg',
  genres: ['Action', 'Sci-Fi'],
  language: 'en',
  rating: 9.5,
  personal_note: 'Mind-blowing movie!',
  mood: ['epic', 'mind-bending'],
  ott_links: [{ platform: 'Netflix', url: 'https://netflix.com', availableIn: 'US' }],
  tmdb_id: 27205,
  created_at: '2024-01-15T12:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
  user: {
    id: 'user-456',
    name: 'John Doe',
    username: 'johndoe',
    avatar: '🍿',
    email: 'john@example.com',
    created_at: '2024-01-01T00:00:00Z',
  },
};

describe('MovieCard', () => {
  it('should render movie details', () => {
    render(<MovieCard recommendation={mockRecommendation} />);

    expect(screen.getByText('Inception')).toBeInTheDocument();
    expect(screen.getByText('(2010)')).toBeInTheDocument();
    expect(screen.getByText('Mind-blowing movie!')).toBeInTheDocument();
    expect(screen.getByText('9.5/10')).toBeInTheDocument();
  });

  it('should render genres', () => {
    render(<MovieCard recommendation={mockRecommendation} />);

    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
  });

  it('should render mood tags', () => {
    render(<MovieCard recommendation={mockRecommendation} />);

    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText('mind-bending')).toBeInTheDocument();
  });

  it('should render OTT links', () => {
    render(<MovieCard recommendation={mockRecommendation} />);

    const netflixLink = screen.getByText('Netflix');
    expect(netflixLink).toBeInTheDocument();
    expect(netflixLink.closest('a')).toHaveAttribute('href', 'https://netflix.com');
  });

  it('should show user info when showUser is true', () => {
    render(<MovieCard recommendation={mockRecommendation} showUser={true} />);

    expect(screen.getByText('🍿')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should call onSendToFriend when Send button clicked', () => {
    const onSendToFriend = vi.fn();
    render(<MovieCard recommendation={mockRecommendation} onSendToFriend={onSendToFriend} />);

    const sendButton = screen.getByLabelText('Send to Friend');
    fireEvent.click(sendButton);

    expect(onSendToFriend).toHaveBeenCalledWith(mockRecommendation);
  });

  it('should call onDelete when Delete button clicked', () => {
    const onDelete = vi.fn();
    render(<MovieCard recommendation={mockRecommendation} onDelete={onDelete} />);

    const deleteButton = screen.getByLabelText('Delete');
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith('rec-123');
  });
});
```

---

### Testing Context Providers

**File**: `src/components/AuthProvider.test.tsx`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthProvider';
import { createClient } from '@/lib/supabase';

// Mock component to test useAuth hook
function TestComponent() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not logged in</div>;

  return <div>Logged in as {user.email}</div>;
}

describe('AuthProvider', () => {
  it('should provide auth context', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    vi.mocked(createClient().auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser } },
      error: null,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Logged in as test@example.com')).toBeInTheDocument();
    });
  });

  it('should show not logged in when no session', async () => {
    vi.mocked(createClient().auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Not logged in')).toBeInTheDocument();
    });
  });
});
```

---

## Integration Testing

### Testing API Routes

**File**: `src/app/api/send-friend-recommendations/route.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { POST } from './route';

describe('POST /api/send-friend-recommendations', () => {
  it('should send recommendations to friends', async () => {
    const mockRequest = new Request('http://localhost:3000/api/send-friend-recommendations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recommendations: [
          {
            sender_id: 'user-123',
            recipient_id: 'friend-456',
            movie_title: 'Inception',
            movie_poster: 'https://image.tmdb.org/t/p/w500/abc.jpg',
            movie_year: 2010,
            personal_message: 'You'll love this!',
          },
        ],
      }),
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sent).toBe(1);
    expect(data.sentRecipientIds).toContain('friend-456');
  });

  it('should reject unauthenticated requests', async () => {
    const mockRequest = new Request('http://localhost:3000/api/send-friend-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendations: [] }),
    });

    const response = await POST(mockRequest);

    expect(response.status).toBe(401);
  });

  it('should validate request payload', async () => {
    const mockRequest = new Request('http://localhost:3000/api/send-friend-recommendations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invalid: 'payload' }),
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(data.sent).toBe(0);
  });
});
```

---

### Testing Database Operations

**File**: `src/lib/supabase.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from './supabase';

describe('Supabase Operations', () => {
  const supabase = createClient();
  let testUserId: string;

  beforeEach(async () => {
    // Create test user
    const { data } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
    });
    testUserId = data.user!.id;
  });

  it('should create recommendation', async () => {
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: testUserId,
        title: 'Test Movie',
        year: 2024,
        type: 'movie',
        poster: 'https://example.com/poster.jpg',
        genres: ['Action'],
        language: 'en',
        personal_note: 'Great movie!',
        ott_links: [],
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.title).toBe('Test Movie');
  });

  it('should enforce RLS policies', async () => {
    // Try to update another user's recommendation
    const { error } = await supabase
      .from('recommendations')
      .update({ title: 'Hacked' })
      .eq('user_id', 'other-user-id');

    expect(error).not.toBeNull(); // Should be blocked by RLS
  });
});
```

---

## End-to-End Testing

### Install Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Playwright Config

**File**: `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

### E2E Test Examples

**File**: `e2e/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should signup new user', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Sign Up');

    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');

    await page.click('button:has-text("Create Account")');

    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Test User')).toBeVisible();
  });

  test('should login existing user', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');

    await page.click('button:has-text("Log In")');

    await expect(page).toHaveURL('/');
  });

  test('should logout user', async ({ page, context }) => {
    // Login first
    await page.goto('/');
    await page.click('text=Log In');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Log In")');

    // Logout
    await page.click('[aria-label="User menu"]');
    await page.click('text=Logout');

    await expect(page.locator('text=Log In')).toBeVisible();
  });
});
```

**File**: `e2e/recommendations.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Recommendations', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.click('text=Log In');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button:has-text("Log In")');
  });

  test('should add recommendation', async ({ page }) => {
    await page.click('text=Add Movie');

    // Search for movie
    await page.fill('input[placeholder="Search movies..."]', 'Inception');
    await page.waitForSelector('text=Inception (2010)');
    await page.click('text=Inception (2010)');

    // Fill details
    await page.selectOption('select[name="type"]', 'movie');
    await page.fill('textarea[name="personalNote"]', 'Amazing movie!');
    await page.click('label:has-text("Epic")');
    await page.click('label:has-text("Mind-bending")');

    // Submit
    await page.click('button:has-text("Submit")');

    await expect(page.locator('text=Recommendation added!')).toBeVisible();
    await expect(page.locator('text=Inception')).toBeVisible();
  });

  test('should send recommendation to friend', async ({ page }) => {
    // Find recommendation card
    await page.hover('text=Inception');
    await page.click('[aria-label="Send to Friend"]');

    // Select friend
    await page.check('label:has-text("John Doe")');
    await page.fill('textarea[name="personalMessage"]', 'You\'ll love this!');

    // Send
    await page.click('button:has-text("Send")');

    await expect(page.locator('text=Sent to 1 friend')).toBeVisible();
  });
});
```

---

## Manual Testing

### Feature Testing Checklist

#### Authentication
- [ ] Signup with email/password
- [ ] Login with email/password
- [ ] Login with Google OAuth
- [ ] Logout
- [ ] Session persistence (refresh page)
- [ ] Invalid credentials error handling
- [ ] Duplicate email error handling
- [ ] Username availability checking
- [ ] Avatar picker

#### Recommendations
- [ ] Search movies via TMDB
- [ ] Add recommendation with all fields
- [ ] Edit recommendation
- [ ] Delete recommendation
- [ ] View recommendation details
- [ ] Filter by type, genre, language
- [ ] Sort by date, rating

#### Friends
- [ ] Add friend by username
- [ ] Remove friend
- [ ] View friends list
- [ ] Send recommendation to friend
- [ ] Send to multiple friends
- [ ] View friend recommendations
- [ ] Mark recommendation as read
- [ ] Mark recommendation as watched

#### Watchlist
- [ ] Add to watchlist
- [ ] Remove from watchlist
- [ ] View watchlist modal
- [ ] Mark as watched from watchlist

#### UI/UX
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode toggle
- [ ] Toast notifications
- [ ] Loading states
- [ ] Empty states
- [ ] Error states
- [ ] Onboarding tour (first visit)
- [ ] Daily quote banner

---

### Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS 15+)
- [ ] Chrome Android (latest)

---

### Performance Testing

#### Lighthouse Audit

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit
lighthouse https://bingeitbro.com --view
```

**Target Scores**:
- Performance: >90
- Accessibility: >95
- Best Practices: >95
- SEO: >90

#### Core Web Vitals

- **LCP** (Largest Contentful Paint): <2.5s
- **FID** (First Input Delay): <100ms
- **CLS** (Cumulative Layout Shift): <0.1

---

### Load Testing

#### Install Artillery

```bash
npm install -g artillery
```

#### Create Load Test

**File**: `load-test.yml`

```yaml
config:
  target: 'https://bingeitbro.com'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users per second
    - duration: 120
      arrivalRate: 50  # Ramp up to 50 users/sec

scenarios:
  - name: 'Browse recommendations'
    flow:
      - get:
          url: '/'
      - think: 2
      - get:
          url: '/api/recommendations'
      - think: 3
      - get:
          url: '/movie/27205'
```

```bash
# Run load test
artillery run load-test.yml
```

---

## Security Testing

### OWASP Top 10 Checklist

- [ ] **SQL Injection**: Test with malicious input in search
- [ ] **XSS**: Test with `<script>alert('XSS')</script>` in notes
- [ ] **CSRF**: Verify CSRF tokens on forms
- [ ] **Authentication**: Test weak passwords, session hijacking
- [ ] **Authorization**: Test accessing other users' data
- [ ] **Sensitive Data Exposure**: Check network tab for secrets
- [ ] **XXE**: Test file upload vulnerabilities
- [ ] **SSRF**: Test API routes with malicious URLs
- [ ] **Insecure Deserialization**: Test JSON payloads
- [ ] **Logging**: Verify no secrets in console/logs

---

### Penetration Testing

#### Test RLS Policies

```sql
-- Login as user A
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-a-id';

-- Try to access user B's data
SELECT * FROM recommendations WHERE user_id = 'user-b-id';
-- Expected: Empty result (blocked by RLS)

-- Try to update user B's recommendation
UPDATE recommendations SET title = 'Hacked' WHERE user_id = 'user-b-id';
-- Expected: 0 rows updated (blocked by RLS)
```

#### Test API Authorization

```bash
# Try to send recommendation without auth
curl -X POST https://bingeitbro.com/api/send-friend-recommendations \
  -H "Content-Type: application/json" \
  -d '{"recommendations": [...]}'
# Expected: 401 Unauthorized

# Try to send with invalid token
curl -X POST https://bingeitbro.com/api/send-friend-recommendations \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"recommendations": [...]}'
# Expected: 401 Unauthorized
```

---

## Testing Checklist

### Pre-Release Checklist

- [ ] All unit tests passing (`npm test`)
- [ ] All E2E tests passing (`npx playwright test`)
- [ ] Manual testing completed
- [ ] Lighthouse audit >90
- [ ] Security testing completed
- [ ] Browser compatibility verified
- [ ] Mobile responsiveness verified
- [ ] Dark mode tested
- [ ] Error handling tested (network failures, API errors)
- [ ] Loading states tested
- [ ] Empty states tested
- [ ] Database migrations tested on staging
- [ ] RLS policies verified
- [ ] Performance benchmarks met
- [ ] No console errors in production build

---

### Post-Deployment Checklist

- [ ] Production smoke test (login, add recommendation, send to friend)
- [ ] Verify environment variables loaded correctly
- [ ] Check Vercel logs for errors
- [ ] Monitor Supabase dashboard for errors
- [ ] Test OAuth redirect (Google login)
- [ ] Verify TMDB API quota
- [ ] Check analytics (Google Analytics, Vercel Analytics)
- [ ] Monitor error tracking (Sentry, if configured)

---

## Continuous Integration (Future)

### GitHub Actions Workflow

**File**: `.github/workflows/test.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm test

      - name: Run E2E tests
        run: npx playwright test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

**Last Updated**: January 2024
