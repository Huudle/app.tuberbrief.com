import { NextResponse } from "next/server";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Plan, Subscription } from "@/lib/types";
import { getOrCreateStripeCustomer, stripe } from "@/lib/stripe-utils";

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { userId, planId } = await req.json();

    logger.info("Starting subscription update", {
      prefix: "Subscription",
      data: {
        userId,
        planId,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      },
    });

    // Get the current subscription with usage count and Stripe info
    const { data: currentSub, error: subError } = await supabaseAnon
      .from("subscriptions")
      .select(
        `
        plan_id,
        usage_count,
        stripe_subscription_id,
        stripe_customer_id,
        plans (
          plan_name,
          monthly_email_limit,
          channel_limit,
          stripe_price_id
        )
      `
      )
      .eq("profile_id", userId)
      .single<Subscription>();

    if (subError) {
      logger.error("Failed to fetch current subscription", {
        prefix: "Subscription",
        data: { error: subError, userId },
      });
      throw subError;
    }

    logger.info("Current subscription state", {
      prefix: "Subscription",
      data: {
        hasExistingSubscription: !!currentSub?.stripe_subscription_id,
        currentPlan: currentSub?.plans?.plan_name,
        currentUsage: currentSub?.usage_count,
        stripeCustomerId: currentSub?.stripe_customer_id,
      },
    });

    // Get the new plan details
    const { data: newPlan, error: planError } = await supabaseAnon
      .from("plans")
      .select(
        "id, plan_name, monthly_email_limit, channel_limit, stripe_price_id, monthly_cost"
      )
      .eq("id", planId)
      .single<Plan>();

    if (planError || !newPlan) {
      logger.error("Failed to fetch new plan", {
        prefix: "Subscription",
        data: { error: planError, planId },
      });
      throw planError || new Error("Plan not found");
    }

    if (!newPlan.stripe_price_id) {
      logger.error("Invalid plan configuration", {
        prefix: "Subscription",
        data: { planId, newPlan },
      });
      return NextResponse.json(
        { error: "Invalid plan configuration" },
        { status: 400 }
      );
    }

    if (newPlan.monthly_cost === 0) {
      // Fetch profile data first
      const { data: profile } = await supabaseAnon
        .from("profiles")
        .select("id, email, first_name, last_name")
        .eq("id", userId)
        .single();

      if (!profile?.email) {
        logger.error("User email not found", {
          prefix: "Subscription",
          data: { userId },
        });
        return NextResponse.json(
          { error: "User email not found" },
          { status: 400 }
        );
      }

      // Get or create a Stripe customer even for free plans
      const stripeCustomerId = await getOrCreateStripeCustomer({
        existingCustomerId: currentSub?.stripe_customer_id,
        profileId: userId,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        source: "Subscription",
      });

      // Check if the free plan has a valid price ID
      if (!newPlan.stripe_price_id) {
        logger.error("Free plan is missing a Stripe price ID", {
          prefix: "Subscription",
          data: { planId: newPlan.id, planName: newPlan.plan_name },
        });

        // Fallback to just creating the subscription in database without Stripe subscription
        await supabaseAnon.from("subscriptions").upsert(
          {
            profile_id: userId,
            plan_id: newPlan.id,
            status: "active",
            usage_count: 0,
            start_date: new Date().toISOString(),
            end_date: null,
            stripe_customer_id: stripeCustomerId,
          },
          { onConflict: "profile_id" }
        );

        logger.info(
          "Free plan subscription updated with Stripe customer only (no Stripe subscription)",
          {
            prefix: "Subscription",
            data: {
              userId,
              planId: newPlan.id,
              stripeCustomerId,
            },
          }
        );

        return NextResponse.json({
          success: true,
          requiresPaymentMethod: false,
          customer_id: stripeCustomerId,
        });
      }

      try {
        // Create an actual Stripe subscription for the free plan
        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: newPlan.stripe_price_id }],
          metadata: {
            user_id: userId,
            plan_type: "free",
          },
          // No payment needed for free plan
          collection_method: "charge_automatically",
        });

        // Update subscription in database
        await supabaseAnon.from("subscriptions").upsert(
          {
            profile_id: userId,
            plan_id: newPlan.id,
            status: subscription.status,
            usage_count: 0,
            start_date: new Date(
              subscription.current_period_start * 1000
            ).toISOString(),
            end_date: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: subscription.id,
          },
          { onConflict: "profile_id" }
        );

        logger.info("Free plan subscription created with Stripe subscription", {
          prefix: "Subscription",
          data: {
            userId,
            planId: newPlan.id,
            stripeCustomerId,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
          },
        });

        return NextResponse.json({
          success: true,
          requiresPaymentMethod: false,
          customer_id: stripeCustomerId,
          subscription_id: subscription.id,
        });
      } catch (error) {
        logger.error("Failed to create Stripe subscription for free plan", {
          prefix: "Subscription",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            userId,
            planId: newPlan.id,
            stripeCustomerId,
          },
        });

        // Fallback to just creating the subscription in database
        await supabaseAnon.from("subscriptions").upsert(
          {
            profile_id: userId,
            plan_id: newPlan.id,
            status: "active",
            usage_count: 0,
            start_date: new Date().toISOString(),
            end_date: null,
            stripe_customer_id: stripeCustomerId,
          },
          { onConflict: "profile_id" }
        );

        return NextResponse.json({
          success: true,
          requiresPaymentMethod: false,
          customer_id: stripeCustomerId,
        });
      }
    }

    // Fetch profile data first
    const { data: profile } = await supabaseAnon
      .from("profiles")
      .select("id, email, first_name, last_name")
      .eq("id", userId)
      .single();

    if (!profile?.email) {
      logger.error("User email not found", {
        prefix: "Subscription",
        data: { userId },
      });
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Get valid customer ID
    const stripeCustomerId = await getOrCreateStripeCustomer({
      existingCustomerId: currentSub?.stripe_customer_id,
      profileId: userId,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      source: "Subscription",
    });

    // Create new subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: newPlan.stripe_price_id }],
      payment_settings: {
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      metadata: {
        user_id: userId,
      },
      trial_period_days: 0,
      payment_behavior: "default_incomplete",
    });

    // Create a SetupIntent for the customer
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    // Update subscription in database
    await supabaseAnon.from("subscriptions").upsert(
      {
        profile_id: userId,
        plan_id: newPlan.id,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: stripeCustomerId,
        usage_count: currentSub?.usage_count ?? 0,
        status: subscription.status,
        start_date: new Date(
          subscription.current_period_start * 1000
        ).toISOString(),
        end_date: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      },
      {
        onConflict: "profile_id",
      }
    );

    logger.info("Subscription update completed", {
      prefix: "Subscription",
      data: {
        userId,
        oldPlan: currentSub?.plans?.plan_name,
        newPlan: newPlan.plan_name,
        subscriptionId: subscription.id,
        customerId: stripeCustomerId,
        durationMs: Date.now() - startTime,
      },
    });

    return NextResponse.json({
      success: true,
      requiresPaymentMethod: true,
      clientSecret: setupIntent.client_secret,
      subscriptionId: subscription.id,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Subscription update failed", {
      prefix: "Subscription",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update subscription",
      },
      { status: 500 }
    );
  }
}
