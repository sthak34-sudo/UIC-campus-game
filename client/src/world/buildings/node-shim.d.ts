// Minimal typings for the two Node built-ins the building tests use (no @types/node in this repo).
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function statSync(path: string): { size: number };
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
