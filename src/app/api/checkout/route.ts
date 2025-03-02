import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logger } from "@/lib/logger";
import { getAppUrl } from "@/lib/utils";

const STRIPE_SECRET_KEY =
  process.env.NODE_ENV === "production"
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST;
const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

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

    // Create customer if doesn't exist
    let stripeCustomerId = profile?.subscription?.stripe_customer_id;

    if (!stripeCustomerId || stripeCustomerId === "undefined") {
      const customer = await stripe.customers.create({
        email: profile?.email,
        name:
          `${profile?.first_name} ${profile?.last_name}`.trim() || undefined,
        metadata: {
          source: "checkout-flow",
          profile_id: profile.id, // Store profile_id for webhook mapping
        },
      });
      stripeCustomerId = customer.id;
    }

    // Add after getting the customerId from the request
    if (stripeCustomerId && stripeCustomerId.startsWith("cus_")) {
      // Verify customer exists and update metadata if needed
      try {
        const existingCustomer = await stripe.customers.retrieve(
          stripeCustomerId
        );

        // Check if the customer metadata has the profile_id, if not update it
        if (
          !("deleted" in existingCustomer) &&
          (!existingCustomer.metadata?.profile_id ||
            existingCustomer.metadata.profile_id !== profile.id)
        ) {
          await stripe.customers.update(stripeCustomerId, {
            metadata: {
              ...existingCustomer.metadata,
              profile_id: profile.id,
              updated_at: new Date().toISOString(),
            },
          });

          logger.info("Updated customer metadata with profile_id", {
            prefix: "checkout",
            data: {
              customerId: stripeCustomerId,
              profileId: profile.id,
            },
          });
        }
      } catch (e) {
        logger.warn("Invalid customer ID, creating new customer", {
          prefix: "checkout",
          data: {
            receivedCustomerId: stripeCustomerId,
            error: e instanceof Error ? e.message : "Unknown error",
          },
        });
        stripeCustomerId = null;
      }
    }

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
