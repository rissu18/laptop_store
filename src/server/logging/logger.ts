/**
 * Struktureeritud logimine (JSON read). Productionis saab neid koguda ja filtreerida.
 * Saladusi (token, parool, secret, võti) ei logita kunagi — need asendatakse "[REDACTED]".
 */

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const SECRET_KEY = /token|password|passwd|secret|api[-_]?key|authorization|cookie/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(v, depth + 1)]),
  );
}

function write(level: Level, scope: string, message: string, context: Context = {}) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, scope, message, ...(redact(context) as Context) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, context?: Context) => write("debug", scope, message, context),
    info: (message: string, context?: Context) => write("info", scope, message, context),
    warn: (message: string, context?: Context) => write("warn", scope, message, context),
    error: (message: string, context?: Context) => write("error", scope, message, context),
  };
}

export type Logger = ReturnType<typeof createLogger>;
