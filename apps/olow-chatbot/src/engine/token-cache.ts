// ─── Generic 3-tier Token Cache (memory → DB → refresh) ───

export class TokenCache {
  private token: string | null = null;
  private expiry: Date | null = null;

  constructor(
    private readonly systemName: string,
    private readonly refreshFn: () => Promise<{ access_token: string; expires_in: number }>,
    private readonly getBuffer: (name: string) => Promise<{ token: string; expiry: Date } | null>,
    private readonly persistToken: (name: string, resp: { access_token: string; expires_in: number }) => Promise<{ token: string; expiry: Date }>,
  ) {}

  async get(): Promise<string> {
    // 1. Memory cache
    if (this.token && this.expiry && this.expiry > new Date()) {
      return this.token;
    }
    // 2. DB cache
    const cached = await this.getBuffer(this.systemName);
    if (cached) {
      this.token = cached.token;
      this.expiry = cached.expiry;
      return cached.token;
    }
    // 3. Refresh from external API
    const resp = await this.refreshFn();
    const result = await this.persistToken(this.systemName, resp);
    this.token = result.token;
    this.expiry = result.expiry;
    return result.token;
  }

  async forceRefresh(): Promise<void> {
    const resp = await this.refreshFn();
    const result = await this.persistToken(this.systemName, resp);
    this.token = result.token;
    this.expiry = result.expiry;
  }
}
