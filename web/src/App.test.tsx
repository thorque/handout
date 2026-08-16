import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('reports the service as ok when the health endpoint answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })),
    );

    render(<App />);

    expect(await screen.findByText(/service: ok/i)).toBeDefined();
  });

  it('reports the service as unreachable when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom'))),
    );

    render(<App />);

    expect(await screen.findByText(/service: unreachable/i)).toBeDefined();
  });
});
