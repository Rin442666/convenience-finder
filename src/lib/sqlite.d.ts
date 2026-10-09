// Khai báo tối thiểu cho node:sqlite (có sẵn từ Node 22.5+).
// @types/node hiện tại chưa gồm module này nên khai báo thủ công để tsc qua được.
declare module 'node:sqlite' {
  export type SQLInputValue = null | number | bigint | string | NodeJS.ArrayBufferView;
  export interface StatementSync {
    all(...params: SQLInputValue[]): Record<string, unknown>[];
    get(...params: SQLInputValue[]): Record<string, unknown> | undefined;
    run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path?: string);
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}
