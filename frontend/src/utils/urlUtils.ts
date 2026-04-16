export const isHttpUrl = (u: string): boolean => {
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const matchesHost = (u: string, ...hosts: string[]): boolean => {
  try {
    const { hostname } = new URL(u);
    return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
};
