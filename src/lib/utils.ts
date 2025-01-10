import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDefaultAvatar(user: {
  name?: string | null;
  email: string;
  avatar_url?: string | null;
}) {
  console.log("🎭 Getting avatar for user:", {
    name: user.name,
    email: user.email,
    hasAvatarUrl: !!user.avatar_url,
  });

  if (user.avatar_url) {
    console.log("✅ Using provided avatar_url:", user.avatar_url);
    return user.avatar_url;
  }

  // Generate UI Avatar
  const name = user.name || user.email.split("@")[0];
  const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=random`;
  console.log("🎨 UI Avatar URL:", uiAvatarUrl);
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
