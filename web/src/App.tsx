import { useEffect, useState } from 'react';
import { Button } from './components/Button';
import { PlusIcon } from './components/icons';

type ServiceStatus = 'checking' | 'ok' | 'unreachable';

/**
 * The start page's primary action, standing in the frame's action slot.
 *
 * It carries no behaviour yet: creating a publication is the upload story of epic HAN-2,
 * and it fills exactly this button. There is deliberately no `onClick` — a no-op would let
 * the button pretend to work.
 */
export function NewHandoutAction() {
  return (
    <Button>
      <PlusIcon />
      Neues Handout
    </Button>
  );
}

const LABELS: Record<ServiceStatus, string> = {
  checking: 'Service: checking…',
  ok: 'Service: ok',
  unreachable: 'Service: unreachable',
};

async function fetchStatus(): Promise<ServiceStatus> {
  try {
    // Relative path: the service is reached through this page's own origin.
    // See docs/url-namespace.md.
    const response = await fetch('/api/health');
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
