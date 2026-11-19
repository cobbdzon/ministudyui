// Starts the real HTTP app in-process on a free loopback port.
// `start` and `findPort` are injected ports so this box is testable alone.
export interface ServerHandle {
  stop(): void;
}

export interface StartInput {
  port: number;
  dbPath: string;
  serveDist: boolean;
}

export interface ServerHostPorts {
  dbPath: string;
  findPort(): number;
  start(input: StartInput): { port: number; server: ServerHandle };
}

export interface HostedServer {
  port: number;
  url: string;
  stop(): void;
}

export function createServerHost(ports: ServerHostPorts) {
  return {
    start(): HostedServer {
      const port = ports.findPort();
      const started = ports.start({ port, dbPath: ports.dbPath, serveDist: true });
      return {
        port: started.port,
        url: `http://127.0.0.1:${started.port}`,
        stop: () => started.server.stop(),
      };
    },
  };
}

// Real port reservation: bind port 0, read the assigned port, release it.
export function reserveFreePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = probe.port;
  probe.stop(true);
  if (!port) throw new Error('could not reserve a free port');
  return port;
}
