/**
 * Simple in-memory rate limiter.
 * Tracks request counts per key within a time window.
 */

const stores = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: {
  windowMs: number;
  max: number;
  key: (req: any) => string;
  message?: string;
}) {
  return async (c: any, next: any) => {
    const key = options.key(c.req);
    const now = Date.now();
    let store = stores.get(key);

    if (!store || now > store.resetAt) {
      store = { count: 0, resetAt: now + options.windowMs };
      stores.set(key, store);
    }

    store.count++;

    // Cleanup stale entries every 100 requests
    if (store.count % 100 === 0) {
      for (const [k, v] of stores) {
        if (now > v.resetAt) stores.delete(k);
      }
    }

    if (store.count > options.max) {
      return c.json(
        { error: options.message || "Too many requests" },
        429,
      );
    }

    await next();
  };
}
