import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { supabaseAnon } from "@/lib/supabase";
import Stripe from "stripe";

const STRIPE_SECRET_KEY =
  process.env.NODE_ENV === "production"
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST;
const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
  typescript: true,
  telemetry: false,
  maxNetworkRetries: 3,
});

export async function POST(req: Request) {
  try {
    const reqBody = await req.json();
    const { profileId, currentSubId, newPlanId } = reqBody;

    // Log the received parameters
    logger.info("📝 Plan switch request received", {
      prefix: "api/subscription/switch",
      data: {
        profileId,
        currentSubId,
        newPlanId,
        fullBody: reqBody,
        timestamp: new Date().toISOString(),
      },
    });

    if (!profileId || !currentSubId || !newPlanId) {
      logger.warn("Missing required parameters for plan switch", {
        prefix: "api/subscription/switch",
        data: {
          providedParams: { profileId, currentSubId, newPlanId },
        },
      });
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const result = await switchPlanDelayed(profileId, currentSubId, newPlanId);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to switch plan", {
      prefix: "api/subscription/switch",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });

    return NextResponse.json(
      { error: "Failed to schedule plan switch" },
      { status: 500 }
    );
  }
}

/**
 * Initiates a delayed plan switch, canceling the current plan at period end
 * and scheduling a switch to a new plan.
 *
 * @param profileId The user's profile ID
 * @param currentSubId The current subscription ID in Stripe
 * @param newPlanId The ID of the plan to switch to at the end of the current period
 */
export async function switchPlanDelayed(
  profileId: string,
  currentSubId: string,
  newPlanId: string
) {
  try {
    // First, verify that the pending_plans table exists
    const { error: metadataError } = await supabaseAnon
      .from("pending_plans")
      .select("*")
      .limit(1);

    // Check if the error indicates a missing table
    if (metadataError) {
      logger.error("🚨 Error checking pending_plans table", {
        prefix: "stripe/subscription",
        data: {
          error: metadataError,
          errorMessage: metadataError.message,
          details: metadataError.details,
          hint: metadataError.hint,
        },
      });

      // If the error suggests the table doesn't exist, log that specifically
      if (
        metadataError.message?.includes("does not exist") ||
        metadataError.details?.includes("does not exist")
      ) {
        logger.error("🚨 pending_plans table does not exist!", {
          prefix: "stripe/subscription",
          data: {
            suggestion:
              "Create the pending_plans table with the correct schema",
          },
        });
        throw new Error("pending_plans table does not exist");
      }
    }

    // Get new plan details
    const { data: newPlan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id, stripe_price_id")
      .eq("id", newPlanId)
      .single();

    if (planError || !newPlan) {
      logger.error("🚨 Error getting new plan details", {
        prefix: "stripe/subscription",
        data: {
          error: planError,
          profileId,
          newPlanId,
        },
      });
      throw new Error(
        `Failed to get plan details: ${planError?.message || "Plan not found"}`
      );
    }

    // Cancel current subscription at period end
    const updatedSub = await stripe.subscriptions.update(currentSubId, {
      cancel_at_period_end: true,
    });

    // Store pending switch
    logger.info("Attempting to upsert pending plan record", {
      prefix: "stripe/subscription",
      data: {
        profileId,
        newPlanId: newPlan.id,
        stripePriceId: newPlan.stripe_price_id,
        startDate: new Date(updatedSub.current_period_end * 1000).toISOString(),
      },
    });

    const pendingPlanData = {
      profile_id: profileId,
      next_plan_id: newPlan.id,
      stripe_price_id: newPlan.stripe_price_id,
      start_date: new Date(updatedSub.current_period_end * 1000).toISOString(),
    };

    const { data: upsertData, error: upsertError } = await supabaseAnon
      .from("pending_plans")
      .upsert(pendingPlanData, {
        onConflict: "profile_id",
      });

    // Log upsert result to see what was actually returned
    logger.info("Pending plan upsert result", {
      prefix: "stripe/subscription",
      data: {
        success: !upsertError,
        returnedData: upsertData,
        error: upsertError,
      },
    });

    if (upsertError) {
      logger.error("🚨 Failed to store pending plan switch", {
        prefix: "stripe/subscription",
        data: {
          error: upsertError,
          profileId,
          newPlanId,
        },
      });
      throw new Error(`Failed to store pending plan: ${upsertError.message}`);
    }

    logger.info("✅ Successfully scheduled plan switch", {
      prefix: "stripe/subscription",
      data: {
        profileId,
        fromSubId: currentSubId,
        toPlanId: newPlan.id,
        effectiveDate: new Date(
          updatedSub.current_period_end * 1000
        ).toISOString(),
      },
    });

    return {
      success: true,
      endDate: new Date(updatedSub.current_period_end * 1000).toISOString(),
      message: "Plan switch scheduled successfully",
    };
  } catch (error) {
    logger.error("🚨 Failed to schedule plan switch", {
      prefix: "stripe/subscription",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        profileId,
        currentSubId,
        newPlanId,
      },
    });
    throw error;
  }
}
