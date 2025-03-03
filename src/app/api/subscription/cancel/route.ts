import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { STRIPE_SECRET_KEY } from "@/lib/constants";

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function POST(req: Request) {
  try {
    const { profileId, targetPlanId } = await req.json();

    if (!profileId) {
      return NextResponse.json({ error: "Missing profileId" }, { status: 400 });
    }

    // Get current subscription
    const { data: subscription, error: subError } = await supabaseAnon
      .from("subscriptions")
      .select("*, plans(*)")
      .eq("profile_id", profileId)
      .single();

    if (subError || !subscription) {
      logger.error("Failed to find subscription", {
        prefix: "cancel-subscription",
        data: { error: subError, profileId },
      });
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 }
      );
    }

    // Get target plan
    const { data: targetPlan, error: targetPlanError } = await supabaseAnon
      .from("plans")
      .select("*")
      .eq("id", targetPlanId)
      .single();

    if (targetPlanError || !targetPlan) {
      logger.error("Failed to find target plan", {
        prefix: "cancel-subscription",
        data: { error: targetPlanError, targetPlanId },
      });
      return NextResponse.json(
        { error: "Target plan not found" },
        { status: 404 }
      );
    }

    // Determine plan transition type
    const currentPlanIsPaid = subscription.plans.monthly_cost > 0;
    const targetPlanIsFree = targetPlan.monthly_cost === 0;
    const targetPlanIsPaid = targetPlan.monthly_cost > 0;

    // Case 1: Downgrading from Paid to Free - use end-of-period cancellation
    if (
      currentPlanIsPaid &&
      targetPlanIsFree &&
      subscription.stripe_subscription_id
    ) {
      try {
        // Set to cancel at period end in Stripe
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        logger.info("Subscription set to cancel at period end", {
          prefix: "cancel-subscription",
          data: {
            subscriptionId: subscription.stripe_subscription_id,
            profileId,
            fromPlan: subscription.plans.plan_name,
            toPlan: targetPlan.plan_name,
          },
        });

        // The row remains as-is with current plan_id until webhook confirms cancellation
        // subscription.status will remain 'active' until the period ends
        return NextResponse.json({
          success: true,
          message: `Your subscription will be canceled at the end of the billing period (${new Date(
            subscription.end_date
          ).toLocaleDateString()}).`,
        });
      } catch (error) {
        logger.error("Failed to cancel subscription at period end", {
          prefix: "cancel-subscription",
          data: {
            error,
            subscriptionId: subscription.stripe_subscription_id,
          },
        });
        return NextResponse.json(
          { error: "Failed to schedule cancellation" },
          { status: 500 }
        );
      }
    }

    // Case 2: Downgrading between paid plans (Pro → Basic)
    else if (
      currentPlanIsPaid &&
      targetPlanIsPaid &&
      subscription.stripe_subscription_id
    ) {
      try {
        // Get subscription details from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id
        );

        // Update subscription to the new plan price
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: targetPlan.stripe_price_id,
            },
          ],
          proration_behavior: "create_prorations", // This creates credits/charges for mid-cycle changes
        });

        logger.info("Subscription downgraded between paid plans", {
          prefix: "cancel-subscription",
          data: {
            subscriptionId: subscription.stripe_subscription_id,
            profileId,
            fromPlan: subscription.plans.plan_name,
            toPlan: targetPlan.plan_name,
          },
        });

        // Update plan_id in database immediately - the webhook will update too, but this provides immediate feedback
        const { error: updateError } = await supabaseAnon
          .from("subscriptions")
          .update({
            plan_id: targetPlan.id,
          })
          .eq("profile_id", profileId);

        if (updateError) {
          logger.error("Failed to update subscription plan", {
            prefix: "cancel-subscription",
            data: { error: updateError, profileId },
          });
        }

        return NextResponse.json({
          success: true,
          message: `Your plan has been updated to ${targetPlan.plan_name}.`,
        });
      } catch (error) {
        logger.error("Failed to update subscription", {
          prefix: "cancel-subscription",
          data: {
            error,
            subscriptionId: subscription.stripe_subscription_id,
          },
        });
        return NextResponse.json(
          { error: "Failed to update subscription" },
          { status: 500 }
        );
      }
    }

    // Case 3: Free to Free (no change needed)
    else if (!currentPlanIsPaid && targetPlanIsFree) {
      return NextResponse.json({
        success: true,
        message: "You are already on the Free plan.",
      });
    }

    // Case 4: Free to Paid - should be handled by checkout process, not cancellation
    else if (!currentPlanIsPaid && targetPlanIsPaid) {
      return NextResponse.json(
        { error: "Please use the checkout process to upgrade to a paid plan" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Subscription change failed", {
      prefix: "cancel-subscription",
      data: { error },
    });
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
