import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAnon } from "@/lib/supabase";

export async function middleware(request: NextRequest) {
  try {
    // Get the session cookie
    const authCookie = request.cookies.get("flow-fusion-auth");
    let cookieSession;
    try {
      cookieSession = authCookie ? JSON.parse(authCookie.value) : null;
    } catch (e) {
      console.error("Failed to parse auth cookie" + e);
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
      console.log("🔒 Access denied:", request.nextUrl.pathname);
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Auth pages check
    if (
      isAuthenticated &&
      ["/login", "/signup"].includes(request.nextUrl.pathname)
    ) {
      console.log(
        "👤 Redirecting authenticated user from:",
        request.nextUrl.pathname
      );
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error(
      "💥 Middleware error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
