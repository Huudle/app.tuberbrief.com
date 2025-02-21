import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { logger } from "@/lib/logger";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultAvatar(user: {
  name?: string | null;
  email: string;
  avatar_url?: string | null;
}) {
  if (user.avatar_url) {
    logger.debug("✅ Using provided avatar_url", {
      prefix: "Utils",
      data: { avatar_url: user.avatar_url },
    });
    return user.avatar_url;
  }

  // Generate UI Avatar
  const name = user.name || user.email.split("@")[0];
  const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=random`;
  return uiAvatarUrl;
}

export function getRelativeTime(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerMonth = msPerDay * 30;
  const msPerYear = msPerDay * 365;

  const elapsed = now.getTime() - past.getTime();

  if (elapsed < msPerMinute) {
    const seconds = Math.round(elapsed / 1000);
    return `${seconds} ${seconds === 1 ? "second" : "seconds"} ago`;
  } else if (elapsed < msPerHour) {
    const minutes = Math.round(elapsed / msPerMinute);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  } else if (elapsed < msPerDay) {
    const hours = Math.round(elapsed / msPerHour);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else if (elapsed < msPerMonth) {
    const days = Math.round(elapsed / msPerDay);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  } else if (elapsed < msPerYear) {
    const months = Math.round(elapsed / msPerMonth);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    const years = Math.round(elapsed / msPerYear);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }
}

export function parseRelativeTime(relativeTime: string): string {
  logger.debug("🕒 Parsing relative time", {
    prefix: "Utils",
    data: { relativeTime },
  });
  const now = new Date();
  const units: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  // Handle "just now" or empty cases
  if (!relativeTime || relativeTime === "just now") {
    logger.debug("⚡ Returning current time for empty/just now case", {
      prefix: "Utils",
    });
    return now.toISOString();
  }

  // Clean up input
  const cleanInput = relativeTime.trim().toLowerCase();
  logger.debug("🧹 Cleaned input", {
    prefix: "Utils",
    data: { cleanInput },
  });

  // Match patterns like "1 hour ago", "2 days ago", etc.
  const match = cleanInput.match(
    /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/
  );
  if (!match) {
    logger.warn("⚠️ Could not parse relative time", {
      prefix: "Utils",
      data: { input: relativeTime },
    });
    return now.toISOString();
  }

  const [, countStr, unit] = match;
  const count = parseInt(countStr, 10);
  logger.debug("🔢 Parsed values", {
    prefix: "Utils",
    data: { count, unit },
  });

  if (!(unit in units)) {
    logger.warn("⚠️ Unknown time unit", {
      prefix: "Utils",
      data: { unit },
    });
    return now.toISOString();
  }

  const msAgo = count * units[unit];
  const date = new Date(now.getTime() - msAgo);
  logger.debug("📅 Calculated date", {
    prefix: "Utils",
    data: { date: date.toISOString() },
  });

  return date.toISOString();
}

/**
 * Returns the appropriate base URL for the current environment
 * - Development: http://localhost:3000
 * - Production: https://flow-fusion.netlify.app
 */
export function getAppUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return process.env.NEXT_PUBLIC_APP_URL!;
}

/**
 * Builds a full URL by combining the base URL with a path
 * @param path - The path to append to the base URL
 */
export function buildUrl(path: string): string {
  const baseUrl = getAppUrl();
  // Ensure path starts with / and remove any trailing slashes
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function internalFetch(input: string, init?: RequestInit) {
  const baseUrl = getAppUrl();
  const url = input.startsWith("/") ? `${baseUrl}${input}` : input;
  
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "Content-Type": "application/json",
    },
  });
}
