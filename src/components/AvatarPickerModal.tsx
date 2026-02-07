'use client';

import { useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { AVATAR_THEMES } from '@/lib/avatar-options';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  userId: string;
  onSaved?: (avatar: string) => void;
}

export function AvatarPickerModal({
  isOpen,
  onClose,
  currentAvatar,
  userId,
  onSaved,
}: AvatarPickerModalProps) {
  const [selected, setSelected] = useState(currentAvatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!isSupabaseConfigured() || selected === currentAvatar) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar: selected })
        .eq('id', userId);
      if (updateError) throw updateError;
      onSaved?.(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-full max-w-md bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Choose your profile picture
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Movie lover themes — pick one that fits you
            </p>
          </div>

          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-6">
            {AVATAR_THEMES.map((theme) => (
              <div key={theme.name}>
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  {theme.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {theme.options.map((opt) => (
                    <button
                      key={opt.emoji}
                      type="button"
                      onClick={() => setSelected(opt.emoji)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all border-2 ${
                        selected === opt.emoji
                          ? 'border-[var(--accent)] bg-[var(--accent)]/20 scale-110'
                          : 'border-transparent bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)]'
                      }`}
                      title={opt.label}
                    >
                      {opt.emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="px-6 pb-2 text-sm text-red-400">{error}</p>
          )}

          <div className="px-6 py-4 flex gap-3 justify-end border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || selected === currentAvatar}
              className="px-4 py-2 text-sm font-medium rounded-full bg-[var(--accent)] text-[var(--bg-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
