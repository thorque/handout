import { useEffect, useState } from 'react';

type ServiceStatus = 'checking' | 'ok' | 'unreachable';

const LABELS: Record<ServiceStatus, string> = {
  checking: 'Service: checking…',
  ok: 'Service: ok',
  unreachable: 'Service: unreachable',
};

async function fetchStatus(): Promise<ServiceStatus> {
  try {
    // Relative path: the service is reached through this page's own origin.
    // See docs/url-namespace.md.
    const response = await fetch('/_handout/api/health');
    if (!response.ok) return 'unreachable';
    const body = (await response.json()) as { status?: string };
    return body.status === 'ok' ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function App() {
  const [status, setStatus] = useState<ServiceStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    void fetchStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <p>{LABELS[status]}</p>;
}
