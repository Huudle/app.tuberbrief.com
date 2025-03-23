import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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
