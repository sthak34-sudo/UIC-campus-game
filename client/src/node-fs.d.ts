// Just enough of Node's file API for tests that read the committed character file.
// The client tsconfig does not pull in @types/node.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding?: string): string | Uint8Array;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
