// Runtime is Node 22.20+. @types/node 20 does not declare this built-in yet.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    close(): void;
    prepare(sql: string): {
      get(...params: (string | number | null)[]): unknown;
      all(...params: (string | number | null)[]): unknown[];
      run(...params: (string | number | null)[]): { changes: number | bigint };
    };
  }
}
