type FetchRetryOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || isAbortError(error);
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

export async function fetchWithTimeoutRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 9000;
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 1500;
  const retryOnStatuses = options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;

    const externalSignal = init.signal;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok && retryOnStatuses.includes(response.status) && attempt < retries) {
        await sleep(backoffDelay(attempt, retryDelayMs, maxDelayMs));
        continue;
      }

      return response;
    } catch (error) {
      const externallyAborted = Boolean(externalSignal?.aborted) && !timedOut;
      const shouldRetry =
        !externallyAborted && isNetworkError(error) && attempt < retries;

      if (!shouldRetry) {
        throw error;
      }

      await sleep(backoffDelay(attempt, retryDelayMs, maxDelayMs));
    } finally {
      clearTimeout(timeout);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw new Error('Request failed after retries');
}
