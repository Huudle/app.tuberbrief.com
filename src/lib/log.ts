import fs from "fs/promises";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

// Initialize log directory
async function initLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create log directory:", error);
  }
}

// Initialize on module load
initLogDir();

async function getLogFilePath(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const yearDir = path.join(LOG_DIR, String(year));
  const monthDir = path.join(yearDir, month);

  await fs.mkdir(yearDir, { recursive: true });
  await fs.mkdir(monthDir, { recursive: true });

  return path.join(monthDir, `${day}.log`);
}

export async function writeLogEntry(logEntry: {
  message: string;
  level?: string;
  timestamp?: string;
  prefix?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Format the log entry similar to logger.ts console output
    const parts = [];

    // Add timestamp
    parts.push(`[${logEntry.timestamp || new Date().toISOString()}]`);

    // Add level in uppercase
    if (logEntry.level) {
      parts.push(`[${logEntry.level.toUpperCase()}]`);
    }

    // Add prefix if exists
    if (logEntry.prefix) {
      parts.push(`[${logEntry.prefix}]`);
    }

    // Add message
    parts.push(logEntry.message);

    // Add data if exists
    if (logEntry.data) {
      parts.push(JSON.stringify(logEntry.data, null, 2));
    }

    // Combine all parts with spaces and add newline
    const formattedEntry = parts.join(" ") + "\n";

    const logFile = await getLogFilePath();
    await fs.appendFile(logFile, formattedEntry);
  } catch (error) {
    console.error("Failed to write log entry:", error);
    throw error;
  }
}
