// Pure window policy: navigation is locked to our own origin and the view is
// sandboxed (no native RPC). Kept free of electrobun imports so it is testable.
export interface WindowConfig {
  url: string;
  token: string;
}

export interface WindowPolicy {
  title: string;
  url: string;
  frame: { width: number; height: number; x: number; y: number };
  sandbox: boolean;
  navigationRules: string;
}

export function windowPolicy({ url, token }: WindowConfig): WindowPolicy {
  const target = new URL(url);
  target.searchParams.set('token', token);
  // Rules are allow-by-default, so deny everything first, then allow our
  // origin. Last matching rule wins.
  const navigationRules = JSON.stringify(['^*', `${target.origin}/*`]);
  return {
    title: 'ministudyui',
    url: target.toString(),
    frame: { width: 1000, height: 720, x: 160, y: 120 },
    sandbox: true,
    navigationRules,
  };
}
