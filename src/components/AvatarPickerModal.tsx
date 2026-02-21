'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IMAGE_AVATAR_THEMES, ImageAvatarOption } from '@/lib/avatar-options';

interface AvatarPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
}

export function AvatarPickerModal({ isOpen, onClose, onSelect }: AvatarPickerModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-[#1a1a1a] flex flex-col overflow-y-auto h-[100dvh]"
                >
                    <div className="w-full max-w-xl mx-auto flex flex-col relative h-full">

                        {/* Header */}
                        <div className="sticky top-0 z-10 flex items-center justify-center p-4 bg-[#1a1a1a]">
                            <button
                                onClick={onClose}
                                className="absolute left-4 w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors"
                                aria-label="Back"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
                                    <path d="m15 18-6-6 6-6" />
                                </svg>
                            </button>
                            <h2 className="text-xl font-bold text-white tracking-wide">Choose Icon</h2>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-4 pb-12 space-y-8 overflow-y-auto">
                            {IMAGE_AVATAR_THEMES.map((theme) => (
                                <div key={theme.name} className="space-y-4">
                                    <h3 className="text-xl font-bold text-white/95 px-1 tracking-tight">{theme.name}</h3>
                                    <div className="grid grid-cols-4 gap-3">
                                        {theme.options.map((option: ImageAvatarOption) => (
                                            <button
                                                key={option.id}
                                                onClick={() => {
                                                    onSelect(option.path);
                                                    onClose();
                                                }}
                                                className="relative w-full aspect-[4/5] rounded-md overflow-hidden hover:ring-2 hover:ring-white/50 transition-all focus:outline-none focus:ring-4 focus:ring-accent group transform active:scale-[0.98]"
                                            >
                                                <img
                                                    src={option.path}
                                                    alt={`${theme.name} character`}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
