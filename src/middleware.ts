import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// List of allowed origins for the YouTube summarizer
const allowedOrigins = [
  "http://localhost:4322",
  "https://tuberbrief.com",
  "https://www.tuberbrief.com",
  "https://app.tuberbrief.com",
  "http://localhost:3000",
];

// Helper function to check if the request is for the API
function isApiRoute(pathname: string) {
  return pathname.startsWith("/api/");
}

// Helper function to check if the request is for the log endpoint
function isLogEndpoint(pathname: string) {
  return pathname === "/api/log";
}

// Helper function to check if the request is from an allowed domain
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

export async function middleware(request: NextRequest) {
  try {
    const pathname = request.nextUrl.pathname;
    const origin = request.headers.get("origin");

    // Handle CORS for API routes
    if (isApiRoute(pathname)) {
      // Handle preflight requests
      if (request.method === "OPTIONS") {
        // For preflight requests, we need to check the origin first
        if (!isLogEndpoint(pathname) && !isAllowedOrigin(origin)) {
          return new NextResponse(null, {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        // At this point we know origin is not null and is allowed
        return new NextResponse(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": isLogEndpoint(pathname)
              ? "*"
              : origin!,
            "Access-Control-Max-Age": "86400", // 24 hours
            "Access-Control-Allow-Credentials": isLogEndpoint(pathname)
              ? "false"
              : "true",
          },
        });
      }

      // Check if the origin is allowed
      if (!isLogEndpoint(pathname) && !isAllowedOrigin(origin)) {
        return new NextResponse(
          JSON.stringify({
            error: "Forbidden",
            message: "Origin not allowed",
          }),
          {
            status: 403,
            statusText: "Forbidden",
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": origin!,
              "Access-Control-Allow-Credentials": "true",
            },
          }
        );
      }

      // Allow the request and set CORS headers
      const response = NextResponse.next();
      response.headers.set(
        "Access-Control-Allow-Origin",
        isLogEndpoint(pathname) ? "*" : origin!
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
      );
      response.headers.set(
        "Access-Control-Allow-Credentials",
        isLogEndpoint(pathname) ? "false" : "true"
      );

      return response;
    }

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
