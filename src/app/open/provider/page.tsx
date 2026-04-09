import { ProviderLaunchClient } from './ProviderLaunchClient';

type ProviderLaunchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

export default async function ProviderLaunchPage({ searchParams }: ProviderLaunchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <ProviderLaunchClient
      appUrl={firstValue(resolvedSearchParams.app, '')}
      browserUrl={firstValue(resolvedSearchParams.web, '')}
      label={firstValue(resolvedSearchParams.label, 'provider')}
    />
  );
}

