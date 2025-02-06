import { buildUrl } from "./utils";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  level?: LogLevel;
  timestamp?: boolean;
  prefix?: string;
  data?: Record<string, unknown>;
}

const defaultOptions: LogOptions = {
  level: "info",
  timestamp: true,
  prefix: "",
};

class Logger {
  private static instance: Logger;
  private isDevelopment: boolean = process.env.NODE_ENV !== "production";

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatError(error: unknown): string {
    return error instanceof Error
      ? `${error.message}\nStack: ${error.stack || "No stack trace"}`
      : "Unknown error";
  }

  private formatMessage(message: unknown, options: LogOptions = {}): string {
    try {
      const opts = { ...defaultOptions, ...options };
      const parts = [];

      if (opts.timestamp) parts.push(`[${this.getTimestamp()}]`);
      if (opts.level) parts.push(`[${opts.level.toUpperCase()}]`);
      if (opts.prefix) parts.push(`[${opts.prefix}]`);

      const messageStr =
        message instanceof Error
          ? this.formatError(message)
          : typeof message === "object"
          ? JSON.stringify(message, null, 2)
          : String(message);

      parts.push(messageStr.trim());

      if (opts.data) {
        parts.push(`\nData: ${JSON.stringify(opts.data, null, 2)}`);
      }

      return parts.join(" ");
    } catch (error) {
      return `[ERROR] Failed to format log message: ${this.formatError(error)}`;
    }
  }

  private async writeLog(
    message: unknown,
    options: LogOptions = {}
  ): Promise<void> {
    try {
      const formattedMessage = this.formatMessage(message, options);

      console.log(formattedMessage);

      const response = await fetch(buildUrl("/api/log"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: String(message),
          level: options.level,
          timestamp: this.getTimestamp(),
          prefix: options.prefix,
          data: options.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to write log: ${response.statusText}`);
      }
    } catch (error) {
      // Fallback to console in case of API failure
      console.error("Failed to write log:", error);
    }
  }

  public async log(message: unknown, options: LogOptions = {}): Promise<void> {
    await this.writeLog(message, options);
  }

  public debug(message: unknown, options: LogOptions = {}): void {
    this.writeLog(message, { ...options, level: "debug" });
  }

  public info(message: unknown, options: LogOptions = {}): void {
    this.writeLog(message, { ...options, level: "info" });
  }

  public warn(message: unknown, options: LogOptions = {}): void {
    this.writeLog(message, { ...options, level: "warn" });
  }

  public error(message: unknown, options: LogOptions = {}): void {
    this.writeLog(message, { ...options, level: "error" });
  }
}

export const logger = Logger.getInstance();
