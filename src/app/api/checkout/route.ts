import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAppUrl } from "@/lib/utils";
import { getOrCreateStripeCustomer, stripe } from "@/lib/stripe-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    logger.debug("Checkout request received", {
      prefix: "checkout",
      data: {
        headers: req.headers,
        body: {
          priceId: body.priceId,
          profile: body.profile,
        },
      },
    });

    const { priceId, profile } = body;

    // Validate input
    if (!priceId || !profile) {
      return NextResponse.json(
        { error: "Missing required price ID or profile" },
        { status: 400 }
      );
    }

    // Get or create a Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer({
      existingCustomerId: profile?.subscription?.stripe_customer_id,
      profileId: profile.id,
      email: profile?.email,
      firstName: profile?.first_name,
      lastName: profile?.last_name,
      source: "checkout",
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: profile.id,
      metadata: {
        profile_id: profile.id,
        email: profile?.email,
        created_from: "checkout-api",
      },
      success_url: `${getAppUrl()}/dashboard/plan?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/dashboard/plan`,
    });

    return NextResponse.json({
      sessionId: session.id,
      customerId: stripeCustomerId,
    });
  } catch (error) {
    logger.error("Failed to create checkout session", {
      prefix: "API/checkout",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
