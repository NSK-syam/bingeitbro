export type RenderProfile = {
  lowPerformance: boolean;
  prefersReducedMotion: boolean;
  isSmallViewport: boolean;
};

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

export function getRenderProfile(): RenderProfile {
  if (typeof window === 'undefined') {
    return {
      lowPerformance: false,
      prefersReducedMotion: false,
      isSmallViewport: false,
    };
  }

  const nav = navigator as NavigatorWithHints;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmallViewport = window.matchMedia('(max-width: 900px)').matches;
  const saveData = nav.connection?.saveData === true;
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const slowNetwork =
    typeof nav.connection?.effectiveType === 'string' &&
    (nav.connection.effectiveType.includes('2g') || nav.connection.effectiveType.includes('3g'));

  return {
    lowPerformance: prefersReducedMotion || saveData || lowMemory || lowCpu || isSmallViewport || slowNetwork,
    prefersReducedMotion,
    isSmallViewport,
  };
}
