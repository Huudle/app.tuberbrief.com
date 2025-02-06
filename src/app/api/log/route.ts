import { NextResponse } from "next/server";
import { writeLogEntry } from "@/lib/log";

export async function POST(request: Request) {
  try {
    const logData = await request.json();

    // Validate required fields
    if (!logData.message) {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    await writeLogEntry(logData);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error writing log:", error);
    return NextResponse.json({ error: "Failed to write log" }, { status: 500 });
  }
}
