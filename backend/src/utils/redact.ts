/**
 * Hide passwords, tokens and other secrets in request data before it is logged
 * (activity log, log files). Keys are matched case-insensitively, ignoring _ and -,
 * at any depth. Returns a copy; the input is not changed.
 * Yes/no values are kept (e.g. mustChangePassword: true says nothing secret).
 * Also used by scripts/redact-activity-log-passwords.ts to clean old log rows.
 */
export const REDACTED = '[REDACTED]';

// Any key containing one of these, e.g. currentPassword, passwordHash, refresh_token
const SENSITIVE_PARTS = ['password', 'passwd', 'token', 'secret', 'apikey', 'authorization'];
// Short names only matched whole, so "pinned" or "shipping" are left alone
const SENSITIVE_KEYS = new Set(['otp', 'pin', 'pincode']);

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEYS.has(k) || SENSITIVE_PARTS.some((part) => k.includes(part));
}

export function redactSensitive<T>(value: T): T {
  return redact(value, new WeakSet()) as T;
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  let out: unknown;
  if (Array.isArray(value)) {
    out = value.map((item) => redact(item, seen));
  } else {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = isSensitiveKey(key) && item !== null && item !== undefined && typeof item !== 'boolean'
        ? REDACTED
        : redact(item, seen);
    }
    out = copy;
  }
  seen.delete(value); // only a loop back to a parent counts as circular
  return out;
}
