export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  let sanitized = message.replace(/(?:api[-_]?key[=:\s]+)([a-zA-Z0-9_-]+)/gi, 'api_key=[REDACTED]');
  if (sanitized.includes('ENOTFOUND')) {
    sanitized = 'DNS resolution failed (ENOTFOUND)';
  } else if (sanitized.includes('ETIMEDOUT')) {
    sanitized = 'Network connection timed out (ETIMEDOUT)';
  } else if (sanitized.includes('ECONNRESET')) {
    sanitized = 'Connection reset by peer (ECONNRESET)';
  } else if (sanitized.includes('fetch failed')) {
    sanitized = 'Network fetch failed';
  }
  if (sanitized.includes('<!DOCTYPE') || sanitized.includes('<html')) {
    sanitized = 'Upstream provider returned HTML error page instead of JSON';
  }
  return sanitized;
}

