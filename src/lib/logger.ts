import fs from "fs";
import path from "path";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  level?: LogLevel;
  timestamp?: boolean;
  prefix?: string;
  data?: Record<string, unknown>; // For structured logging
}

const defaultOptions: LogOptions = {
  level: "info",
  timestamp: true,
  prefix: "",
};

// ANSI color codes for different log levels
const colors = {
  debug: "\x1b[34m", // Blue
  info: "\x1b[32m", // Green
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  reset: "\x1b[0m", // Reset
};

class Logger {
  private static instance: Logger;
  private isDevelopment: boolean = false;
  private logDir: string = "";
  private currentLogFile: string = "";
  private fallbackConsole: boolean = false;

  private constructor() {
    try {
      this.isDevelopment = process.env.NODE_ENV !== "production";
      this.logDir = path.join(process.cwd(), "logs");
      this.initializeLogDirectory();
      this.currentLogFile = this.getLogFilePath();
    } catch (error) {
      // If initialization fails, fall back to console-only logging
      this.fallbackConsole = true;
      this.consoleOutput(
        "error",
        "Logger initialization failed, falling back to console",
        {
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }
      );
    }
  }

  private consoleOutput(
    level: LogLevel,
    message: string,
    options?: LogOptions
  ): void {
    try {
      const color = colors[level] || colors.info;
      const formattedMessage = this.formatMessage(message, {
        ...options,
        level,
      });
      console.log(`${color}${formattedMessage}${colors.reset}`);
    } catch (error) {
      // Last resort fallback
      console.log(
        `[ERROR] Logger failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      console.log("Original message:", message);
      if (options?.data) {
        console.log("Additional data:", options.data);
      }
    }
  }

  private initializeLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      this.fallbackConsole = true;
      this.consoleOutput("error", "Failed to create log directory", {
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  private getDateParts(): { year: string; month: string; day: string } {
    const now = new Date();
    return {
      year: now.getFullYear().toString(),
      month: (now.getMonth() + 1).toString().padStart(2, "0"),
      day: now.getDate().toString().padStart(2, "0"),
    };
  }

  private getLogFilePath(): string {
    try {
      const { year, month, day } = this.getDateParts();
      const monthDir = path.join(this.logDir, year, month);

      fs.mkdirSync(monthDir, { recursive: true });
      return path.join(monthDir, `${day}.log`);
    } catch (error) {
      this.fallbackConsole = true;
      this.consoleOutput("error", "Failed to create log file path", {
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      return "";
    }
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

  private writeToFile(message: string): void {
    if (this.fallbackConsole) return;

    try {
      const currentFilePath = this.getLogFilePath();
      if (currentFilePath !== this.currentLogFile) {
        this.currentLogFile = currentFilePath;
      }

      fs.appendFileSync(this.currentLogFile, message + "\n");
    } catch (error) {
      this.fallbackConsole = true;
      const errorMsg = this.formatMessage(
        "Failed to write to log file, falling back to console",
        {
          level: "error",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        }
      );
      this.consoleOutput("error", errorMsg);
    }
  }

  public log(message: unknown, options: LogOptions = {}): void {
    try {
      const opts = { ...defaultOptions, ...options };
      const formattedMessage = this.formatMessage(message, opts);

      if (!this.fallbackConsole) {
        this.writeToFile(formattedMessage);
      }

      if (this.isDevelopment || this.fallbackConsole) {
        this.consoleOutput(opts.level || "info", formattedMessage);
      }
    } catch (error) {
      // Last resort error handling
      console.log("[CRITICAL] Logger failed completely:", error);
      console.log("Original message:", message);
    }
  }

  public debug(message: unknown, options: LogOptions = {}): void {
    this.log(message, { ...options, level: "debug" });
  }

  public info(message: unknown, options: LogOptions = {}): void {
    this.log(message, { ...options, level: "info" });
  }

  public warn(message: unknown, options: LogOptions = {}): void {
    this.log(message, { ...options, level: "warn" });
  }

  public error(message: unknown, options: LogOptions = {}): void {
    this.log(message, { ...options, level: "error" });
  }

  // Utility method to get all logs for a specific date
  public getLogs(date?: string): string[] {
    try {
      if (!date) {
        return this.getLogsFromFile(this.currentLogFile);
      }

      const [year, month, day] = date.split("-");
      const logFile = path.join(this.logDir, year, month, `${day}.log`);
      return this.getLogsFromFile(logFile);
    } catch (error) {
      const errorMsg = this.formatMessage("Failed to get logs", {
        level: "error",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      this.consoleOutput("error", errorMsg);
      return [];
    }
  }

  private getLogsFromFile(filePath: string): string[] {
    try {
      if (!fs.existsSync(filePath)) {
        return [];
      }

      return fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .filter((line) => line.trim() !== "");
    } catch (error) {
      const errorMsg = this.formatMessage("Failed to read log file", {
        level: "error",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
          filePath,
        },
      });
      this.consoleOutput("error", errorMsg);
      return [];
    }
  }
}

export const logger = Logger.getInstance();
