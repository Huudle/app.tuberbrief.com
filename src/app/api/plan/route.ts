import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { sendPlanChangeEmail } from "@/lib/notifications";
import { internalFetch } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const { userId, planId, planName } = await req.json();

    // Validate input
    if (!userId || !planId || !planName) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Call existing subscription endpoint
    const response = await internalFetch("/api/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, planId }),
    });

    if (!response.ok) {
      throw new Error("Failed to update plan");
    }

    const result = await response.json();

    // Send notification email if payment required
    if (result.requiresPaymentMethod) {
      await sendPlanChangeEmail(userId, planId, planName);
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Plan update failed", {
      prefix: "API/plan",
      data:
        error instanceof Error
          ? { error: error.message }
          : { error: "Unknown error" },
    });

    return NextResponse.json(
      { error: "Failed to update user plan" },
      { status: 500 }
    );
  }
}
