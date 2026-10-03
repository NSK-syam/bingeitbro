import type { SVGProps } from 'react';

/** One stroke icon set for the app shell: 24px, 2px stroke, currentColor. Decorative by default. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 10.5L12 3l9 7.5V21H3z" /></Icon>
);
export const PicksIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);
export const GroupsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);
export const MeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon strokeWidth={2.5} {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 18l6-6-6-6" /></Icon>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15 18l-6-6 6-6" /></Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M18 6L6 18M6 6l12 12" /></Icon>
);
export const PlayIcon = (p: IconProps) => (
  <Icon fill="currentColor" stroke="none" {...p}><path d="M7 4.5v15l13-7.5z" /></Icon>
);
