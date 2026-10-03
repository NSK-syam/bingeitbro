import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--app-accent)] text-[var(--app-on-accent)]',
  secondary: 'bg-[var(--app-raised)] text-[var(--app-text)]',
  ghost: 'bg-transparent text-[var(--app-accent)]',
  danger: 'bg-[var(--app-raised)] text-[var(--app-danger)]',
};

const BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-[18px] text-[15px] font-semibold ' +
  'no-underline transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50';

type CommonProps = { variant?: Variant; block?: boolean; children: ReactNode; className?: string; 'aria-label'?: string };

/** App shell button. Renders a <button>, or a Next <Link> when `href` is given. */
export function AppButton(
  props: CommonProps & ({ href: string } | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })),
) {
  const { variant = 'primary', block = false, className = '', children } = props;
  const classes = `${BASE} ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`.trim();

  if (props.href !== undefined) {
    return <Link href={props.href} className={classes} aria-label={props['aria-label']}>{children}</Link>;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, block: _b, className: _c, children: _ch, href: _h, type = 'button', ...buttonProps } = props;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
