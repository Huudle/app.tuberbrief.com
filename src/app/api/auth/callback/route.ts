import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { event, session } = await request.json();

    if (!event) {
      return NextResponse.json({ error: "Event is required" }, { status: 400 });
    }

    if (event === "SIGNED_IN" && session) {
      await supabaseAnon.auth.setSession(session);

      // Create response with cookie
      const response = NextResponse.json({
        message: "Session set successfully",
      });

      // Set the auth cookie
      response.cookies.set("flow-fusion-auth", JSON.stringify(session), {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        expires: new Date(session.expires_at * 1000),
      });

      return response;
    }

    if (event === "SIGNED_OUT") {
      await supabaseAnon.auth.signOut();

      const response = NextResponse.json({
        message: "Session cleared successfully",
      });

      // Clear the auth cookie
      response.cookies.set("flow-fusion-auth", "", {
        expires: new Date(0),
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      });

      return response;
    }

    return NextResponse.json({
      message: "No action taken",
    });
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
