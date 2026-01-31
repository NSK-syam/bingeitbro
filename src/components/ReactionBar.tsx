'use client';

import { useReactions, REACTIONS, ReactionType } from '@/hooks';

interface ReactionBarProps {
  movieId: string;
  compact?: boolean;
}

export function ReactionBar({ movieId, compact = false }: ReactionBarProps) {
  const { hasReaction, toggleReaction, getActiveReactions } = useReactions();
  const activeReactions = getActiveReactions(movieId);

  const handleClick = (e: React.MouseEvent, reaction: ReactionType) => {
    e.preventDefault();
    e.stopPropagation();
    toggleReaction(movieId, reaction);
  };

  if (compact) {
    // Show only active reactions in compact mode
    if (activeReactions.length === 0) return null;

    return (
      <div className="flex items-center gap-1">
        {activeReactions.map((r) => (
          <span key={r.type} className="text-sm" title={r.label}>
            {r.emoji}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {REACTIONS.map((reaction) => {
        const isActive = hasReaction(movieId, reaction.type);
        return (
          <button
            key={reaction.type}
            onClick={(e) => handleClick(e, reaction.type)}
            className={`
              group relative px-3 py-2 rounded-xl transition-all duration-200
              ${isActive
                ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]/30 scale-105'
                : 'bg-[var(--bg-secondary)] border border-white/5 hover:border-white/10 hover:bg-[var(--bg-card)]'
              }
            `}
            title={reaction.label}
          >
            <span className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
              {reaction.emoji}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ReactionBadges({ movieId }: { movieId: string }) {
  const { getActiveReactions } = useReactions();
  const activeReactions = getActiveReactions(movieId);

  if (activeReactions.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {activeReactions.slice(0, 3).map((r) => (
        <span key={r.type} className="text-xs">
          {r.emoji}
        </span>
      ))}
      {activeReactions.length > 3 && (
        <span className="text-[10px] text-[var(--text-muted)]">+{activeReactions.length - 3}</span>
      )}
    </div>
  );
}
