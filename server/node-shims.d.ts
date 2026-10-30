declare const process: { env: Record<string, string | undefined>; argv: string[] };
declare const Buffer: { byteLength(value: string): number };

declare module 'node:http' {
  export interface IncomingMessage { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; signal: AbortSignal }
  export interface ServerResponse { writeHead(status: number, headers: Record<string, string | number>): void; end(body?: string): void }
  export function createServer(handler: (request: IncomingMessage, response: ServerResponse) => void): { listen(port: number, callback?: () => void): void };
}
