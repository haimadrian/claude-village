// No-op stub for `electron-log/main` used during vitest runs. The real module
// reaches for Electron at import time, which is not available in plain Node.

const noop = (): void => undefined;

const log = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  verbose: noop,
  silly: noop,
  initialize: noop,
  transports: {
    file: {
      level: "info" as string,
      maxSize: 0,
      format: "",
      resolvePathFn: (() => "") as (...args: unknown[]) => string,
      archiveLogFn: (() => undefined) as (...args: unknown[]) => void
    },
    console: {
      level: "info" as string,
      format: ""
    }
  }
};

export default log;
