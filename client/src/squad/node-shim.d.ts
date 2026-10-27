// Minimal typings for the Node built-ins the squad import-ban test uses (no @types/node in this repo).
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Uint8Array;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { size: number };
}
declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
