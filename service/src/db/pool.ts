import { Pool } from 'pg';
import type { Config } from '../config';

/**
 * A connection pool whose `search_path` is pinned to the configured schema, so every
 * statement in the application can name a table unqualified and still land in the right
 * schema — which is what lets the tests run the identical code against a throwaway schema.
 */
export function createPool(config: Config): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    // Forwarded as a startup parameter, so it holds for every connection the pool opens.
    options: `-c search_path=${config.databaseSchema}`,
  });
}
