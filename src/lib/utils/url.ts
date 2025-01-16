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
