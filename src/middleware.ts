import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// List of allowed origins
const allowedOrigins = [
  "https://tuberbrief.com",
  "https://www.tuberbrief.com",
  // Allow localhost during development
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4321",
];

// Helper function to check if the request is for the API
function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  try {
    // Get the session cookie
    const authCookie = request.cookies.get("tuber-brief-auth");
    let cookieSession;
    try {
      cookieSession = authCookie ? JSON.parse(authCookie.value) : null;
    } catch (e) {
      logger.error("🚫 Failed to parse auth cookie", { data: { error: e } });
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseAnon.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    // Use either session source for auth check
    const isAuthenticated = !!session || !!cookieSession;

    // Protected routes check
    if (!isAuthenticated && request.nextUrl.pathname.startsWith("/dashboard")) {
      logger.info("🔒 Access denied - Protected route", {
        data: { path: request.nextUrl.pathname },
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Auth pages check
    if (
      isAuthenticated &&
      ["/login", "/signup"].includes(request.nextUrl.pathname)
    ) {
      logger.info("👋 Redirecting authenticated user", {
        data: { path: request.nextUrl.pathname },
      });
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const origin = request.headers.get("origin");
    const pathname = request.nextUrl.pathname;

    // Only apply CORS checks to API routes
    if (isApiRoute(pathname)) {
      // Handle preflight requests
      if (request.method === "OPTIONS") {
        return new NextResponse(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Max-Age": "86400", // 24 hours
          },
        });
      }

      // Check if the origin is allowed
      if (origin && !allowedOrigins.includes(origin)) {
        return new NextResponse(null, {
          status: 403,
          statusText: "Forbidden",
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      // Allow the request and set CORS headers
      const response = NextResponse.next();
      response.headers.set("Access-Control-Allow-Origin", origin || "*");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );

      return response;
    }

    return NextResponse.next();
  } catch (error) {
    logger.error("💥 Middleware error", {
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        path: request.nextUrl.pathname,
      },
    });
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
