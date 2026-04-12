'use client';

import { AdminRecommendationsShelf } from '@/components/AdminRecommendationsShelf';
import { AdminPushBroadcastPanel } from '@/components/AdminPushBroadcastPanel';
import { Header } from '@/components/Header';
import { HubTabs } from '@/components/HubTabs';
import { MovieBackground } from '@/components/MovieBackground';
import { adminMovieGroups, adminSeriesGroups } from '@/data/admin-recommendations';

export default function AdminPicksHome() {
  return (
    <div className="min-h-screen relative">
      <MovieBackground />
      <Header searchMode="off" />
      <HubTabs placement="center" />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <AdminPushBroadcastPanel />

        <AdminRecommendationsShelf
          title="Movies"
          kicker="Admin picks"
          description="Latest-first movie picks with language and OTT filters, plus the same quick watchlist and OTT cues used in the trending feed."
          groups={adminMovieGroups}
        />

        <AdminRecommendationsShelf
          title="Series"
          kicker="Admin picks"
          description="Latest-first series picks with the same filterable shelf structure and quick access into each show page."
          groups={adminSeriesGroups}
        />
      </main>
    </div>
  );
}
