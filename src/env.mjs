import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    YOUTUBE_API_KEY: z
      .string()
      .min(1, "YouTube API key is required")
      .describe("YouTube Data API v3 key"),

    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, "Supabase service role key is required")
      .describe("Supabase service role key for admin operations"),
  },

  client: {
    NEXT_PUBLIC_SUPABASE_URL: z
      .string()
      .url("Invalid Supabase URL")
      .describe("Supabase project URL"),

    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
      .string()
      .min(1, "Supabase anon key is required")
      .describe("Supabase anonymous key for client operations"),

    NEXT_PUBLIC_APP_URL: z
      .string()
      .url("Invalid app URL")
      .transform((url) => url.replace(/\/$/, "")) // Remove trailing slash
      .describe("Public URL of the application"),
  },

  runtimeEnv: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  // Skip validation in development
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
