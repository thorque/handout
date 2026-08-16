import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('falls back to the documented defaults', () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
    expect(path.isAbsolute(config.dataDir)).toBe(true);
    expect(config.dataDir.endsWith(path.join('var', 'data'))).toBe(true);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a port that is not a number', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('takes every value from the environment', () => {
    const config = loadConfig({
      PORT: '3001',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      HANDOUT_DATA_DIR: '/tmp/handout-test',
    });

    expect(config).toEqual({
      port: 3001,
      host: '127.0.0.1',
      logLevel: 'debug',
      dataDir: '/tmp/handout-test',
    });
  });
});
