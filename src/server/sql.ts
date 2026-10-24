export type SqlValue = string | number | null;
export interface SqlResult { rows: Record<string, SqlValue>[]; changes: number }
export interface SqlConnection {
  execute(sql: string, args?: SqlValue[]): Promise<SqlResult>;
  close(): Promise<void>;
}
export interface SqlDatabase {
  connect(): Promise<SqlConnection>;
  close?(): void;
}
