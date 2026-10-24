import type { SqlConnection, SqlDatabase, SqlResult, SqlValue } from './sql.ts';

type WireValue = { type: 'null' } | { type: 'text' | 'integer' | 'float'; value: string | number };
interface PipelineResult {
  type: 'ok' | 'error';
  error?: { code: string };
  response?: { result?: { cols: { name: string }[]; rows: WireValue[][]; affected_row_count: number } };
}

// Turso's documented SQL-over-HTTP protocol; no persistent socket or local file on Vercel.
export class TursoDatabase implements SqlDatabase {
  private endpoint: string;
  private token: string;
  private fetcher: typeof fetch;
  constructor(url: string, token: string, fetcher: typeof fetch = fetch) {
    const parsed = new URL(url.replace(/^(libsql|turso):/, 'https:'));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error('Turso requires an HTTPS database URL');
    }
    if (!parsed.hostname.endsWith('.turso.io')) throw new Error('Expected a Turso database hostname');
    this.endpoint = `${parsed.origin}/v2/pipeline`;
    this.token = token;
    this.fetcher = fetcher;
  }
  async connect(): Promise<SqlConnection> {
    let baton: string | null = null;
    let endpoint = this.endpoint;
    let closed = false;
    const pipeline = async (requests: unknown[]) => {
      const response = await this.fetcher(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4500),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baton, requests }),
      });
      if (!response.ok) throw new Error(`Turso HTTP ${response.status}`);
      const data = await response.json() as { baton: string | null; base_url?: string; results: PipelineResult[] };
      baton = data.baton;
      if (data.base_url) {
        const routed = new URL(data.base_url);
        if (routed.protocol !== 'https:' || !routed.hostname.endsWith('.turso.io') || routed.username || routed.password) {
          throw new Error('Invalid Turso routing URL');
        }
        endpoint = new URL('/v2/pipeline', routed).href;
      }
      for (const result of data.results) {
        if (result.type === 'error') throw new Error(`Turso SQL ${result.error?.code || 'error'}`);
      }
      return data.results;
    };
    return {
      execute: async (sql: string, args: SqlValue[] = []): Promise<SqlResult> => {
        if (closed) throw new Error('Database connection is closed');
        const values: WireValue[] = args.map(value => value === null ? { type: 'null' } :
          typeof value === 'number' ? { type: Number.isInteger(value) ? 'integer' : 'float', value: String(value) } : { type: 'text', value });
        const responses = await pipeline([{ type: 'execute', stmt: { sql, args: values, want_rows: true } }]);
        const result = responses[0]?.response?.result;
        if (!result) throw new Error('Invalid Turso response');
        return { changes: result.affected_row_count, rows: result.rows.map(row => Object.fromEntries(
          result.cols.map((col, i) => [col.name, row[i].type === 'null' ? null :
            row[i].type === 'integer' || row[i].type === 'float' ? Number(row[i].value) : row[i].value]),
        )) };
      },
      close: async () => {
        if (closed) return;
        closed = true;
        if (baton) await pipeline([{ type: 'close' }]);
      },
    };
  }
}
