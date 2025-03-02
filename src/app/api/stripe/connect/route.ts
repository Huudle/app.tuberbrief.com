import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const STRIPE_SECRET_KEY =
  process.env.NODE_ENV === "production"
    ? process.env.STRIPE_SECRET_KEY
    : process.env.STRIPE_SECRET_KEY_TEST;
const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
  telemetry: false,
  maxNetworkRetries: 3,
});

// Add logging to debug the mode
logger.info("Stripe Customer Portal webhook configuration", {
  prefix: "stripe/customer-portal",
  data: {
    mode: STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "live",
  },
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Parse the body from the request
  const body = await req.text();

  // Log the incoming webhook type before we process it
  try {
    const parsedBody = JSON.parse(body);
    logger.info(`📥 Received Customer Portal webhook: ${parsedBody.type}`, {
      prefix: "stripe/customer-portal",
      data: {
        eventId: parsedBody.id,
        eventType: parsedBody.type,
        apiVersion: parsedBody.api_version,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.warn("⚠️ Could not parse webhook body for logging", {
      prefix: "stripe/customer-portal",
      data: {
        error: error instanceof Error ? error.message : "Unknown parsing error",
      },
    });
  }

  try {
    // Verify the signature with the customer portal webhook secret
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("🚨 Missing Stripe webhook secret", {
        prefix: "stripe/customer-portal",
        data: {
          error:
            "STRIPE_CUSTOMER_PORTAL_WEBHOOK_SECRET environment variable is not set",
        },
      });
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    // Log successful verification
    logger.info(`✓ Customer Portal webhook signature verified: ${event.type}`, {
      prefix: "stripe/customer-portal",
      data: {
        eventId: event.id,
      },
    });

    // Handle relevant event types
    switch (event.type) {
      case "customer.subscription.created":
        const newSubscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(newSubscription);
        break;

      case "customer.subscription.updated":
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(deletedSubscription);
        break;

      case "billing_portal.session.created":
        const portalSession = event.data.object as Stripe.BillingPortal.Session;
        await handlePortalSessionCreated(portalSession);
        break;

      case "billing_portal.configuration.updated":
        const portalConfig = event.data
          .object as Stripe.BillingPortal.Configuration;
        await handlePortalConfigUpdated(portalConfig);
        break;

      default:
        logger.info(`🔔 Unhandled Customer Portal event type ${event.type}`, {
          prefix: "🔔 stripe/customer-portal",
        });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const error = err as Error;

    // Check if it's a signature verification error
    if (error.message?.includes("signature")) {
      logger.error("🚨 Invalid Customer Portal webhook signature", {
        prefix: "stripe/customer-portal",
        data: {
          error: error.message,
          sig: sig?.substring(0, 32), // Log only first part of signature
        },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Other errors
    logger.error("🔥 Customer Portal webhook processing failed", {
      prefix: "stripe/customer-portal",
      data: {
        error: error.message,
        // The event variable might not be defined if there was an error during constructEvent
        type: "unknown",
      },
    });

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  logger.info("🔄 Subscription updated via Customer Portal", {
    prefix: "stripe/customer-portal",
    data: {
      subscriptionId: subscription.id,
      status: subscription.status,
      customerId: subscription.customer,
      priceId: subscription.items.data[0]?.price.id,
      productId: subscription.items.data[0]?.price.product,
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    },
  });

  try {
    // Get price and product information from Stripe
    const priceId = subscription.items.data[0]?.price.id;
    const productId = subscription.items.data[0]?.price.product;

    if (!priceId) {
      logger.error("🚨 Missing price ID in subscription update", {
        prefix: "stripe/customer-portal",
        data: { subscriptionId: subscription.id },
      });
      return;
    }

    // Look up the plan_id based on the price_id
    let planData = null;
    const { data: initialPlan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id, plan_name, monthly_email_limit")
      .eq("stripe_price_id", priceId)
      .single();

    planData = initialPlan;

    // If we can't find the plan by price ID, try to find it by product ID or name
    if (planError || !planData) {
      logger.warn("⚠️ Could not find plan by price ID, trying product lookup", {
        prefix: "stripe/customer-portal",
        data: {
          priceId,
          productId,
          error: planError,
        },
      });

      // Get product details from Stripe to find plan name
      if (typeof productId === "string") {
        try {
          const product = await stripe.products.retrieve(productId);
          const productName = product.name;

          // Try to find by product name match (e.g., "Basic Plan" matches "Basic")
          const { data: planByName, error: nameError } = await supabaseAnon
            .from("plans")
            .select("id, plan_name, monthly_email_limit")
            .ilike("plan_name", `%${productName.split(" ")[0]}%`) // Match first word of product name
            .single();

          if (!nameError && planByName) {
            planData = planByName;

            // Update the price ID for future lookups
            await supabaseAnon
              .from("plans")
              .update({ stripe_price_id: priceId })
              .eq("id", planData.id);

            logger.info("✅ Updated plan with new price ID", {
              prefix: "stripe/customer-portal",
              data: { planId: planData.id, priceId },
            });
          } else {
            logger.error("🚨 Could not find matching plan for product", {
              prefix: "stripe/customer-portal",
              data: { productName, productId },
            });
            return;
          }
        } catch (stripeError) {
          logger.error("🚨 Error retrieving product from Stripe", {
            prefix: "stripe/customer-portal",
            data: {
              error:
                stripeError instanceof Error
                  ? stripeError.message
                  : "Unknown error",
              productId,
            },
          });
          return;
        }
      } else {
        logger.error("🚨 No product ID available for plan lookup", {
          prefix: "stripe/customer-portal",
          data: { subscriptionId: subscription.id },
        });
        return;
      }
    }

    // Get the profile_id based on the customer ID
    const { data: subscriptionData, error: subError } = await supabaseAnon
      .from("subscriptions")
      .select("profile_id, status, id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (subError || !subscriptionData) {
      logger.error("🚨 Error finding subscription for update", {
        prefix: "stripe/customer-portal",
        data: {
          error: subError,
          customerId: subscription.customer,
        },
      });
      return;
    }

    // Ensure we found a valid plan
    if (!planData || !planData.id) {
      logger.error("🚨 No valid plan found for subscription update", {
        prefix: "stripe/customer-portal",
        data: {
          subscriptionId: subscription.id,
          priceId,
          productId,
        },
      });
      return;
    }

    // Prepare the update data
    const updateData = {
      status: subscription.status,
      plan_id: planData.id,
      stripe_subscription_id: subscription.id,
      end_date: new Date(subscription.current_period_end * 1000).toISOString(),
      // Reset usage count when plan changes
      usage_count: 0,
    };

    // Update the subscription in our database
    const { error: updateError } = await supabaseAnon
      .from("subscriptions")
      .update(updateData)
      .eq("profile_id", subscriptionData.profile_id);

    if (updateError) {
      logger.error("🚨 Failed to update subscription via Customer Portal", {
        prefix: "stripe/customer-portal",
        data: {
          error: updateError,
          profileId: subscriptionData.profile_id,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    logger.info("✅ Successfully updated subscription via Customer Portal", {
      prefix: "stripe/customer-portal",
      data: {
        subscriptionId: subscription.id,
        profileId: subscriptionData.profile_id,
        planName: planData?.plan_name,
        status: subscription.status,
      },
    });
  } catch (error) {
    logger.error("🚨 Error in handleSubscriptionUpdate", {
      prefix: "stripe/customer-portal",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info("🗑️ Subscription deleted via Customer Portal", {
    prefix: "stripe/customer-portal",
    data: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      cancellationReason: subscription.cancellation_details?.reason,
    },
  });

  try {
    // Get profile ID from customer ID
    const { data: subscriptionData, error: fetchError } = await supabaseAnon
      .from("subscriptions")
      .select("profile_id, plan_id")
      .eq("stripe_subscription_id", subscription.id)
      .single();

    if (fetchError) {
      logger.error("🚨 Error finding subscription record for deletion", {
        prefix: "stripe/customer-portal",
        data: {
          error: fetchError,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Find the Free plan
    const { data: freePlan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id")
      .eq("plan_name", "Free")
      .single();

    if (planError) {
      logger.error("🚨 Error getting free plan id", {
        prefix: "stripe/customer-portal",
        data: {
          error: planError,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Update to Free plan
    const { error: updateError } = await supabaseAnon
      .from("subscriptions")
      .update({
        plan_id: freePlan.id,
        status: "active", // Set as active on the Free plan
        end_date: null, // Free plan doesn't expire
        usage_count: 0, // Reset usage
      })
      .eq("profile_id", subscriptionData.profile_id);

    if (updateError) {
      logger.error("🚨 Failed to update to free plan after deletion", {
        prefix: "stripe/customer-portal",
        data: {
          error: updateError,
          profileId: subscriptionData.profile_id,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    logger.info("✅ Successfully downgraded to Free plan after deletion", {
      prefix: "stripe/customer-portal",
      data: {
        profileId: subscriptionData.profile_id,
        previousSubscriptionId: subscription.id,
      },
    });
  } catch (error) {
    logger.error("🚨 Error in handleSubscriptionDeleted", {
      prefix: "stripe/customer-portal",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}

async function handlePortalSessionCreated(
  portalSession: Stripe.BillingPortal.Session
) {
  logger.info("🔗 Customer Portal session created", {
    prefix: "stripe/customer-portal",
    data: {
      sessionId: portalSession.id,
      customerId: portalSession.customer,
      returnUrl: portalSession.return_url,
      created: new Date(portalSession.created * 1000).toISOString(),
    },
  });

  // This event is primarily for logging/analytics
  // No database updates needed
}

async function handlePortalConfigUpdated(
  portalConfig: Stripe.BillingPortal.Configuration
) {
  logger.info("⚙️ Customer Portal configuration updated", {
    prefix: "stripe/customer-portal",
    data: {
      configId: portalConfig.id,
      active: portalConfig.active,
      updated: new Date(portalConfig.updated * 1000).toISOString(),
    },
  });

  // This event is primarily for logging/analytics
  // No database updates needed
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info("🎉 Subscription created via Customer Portal", {
    prefix: "stripe/customer-portal",
    data: {
      subscriptionId: subscription.id,
      status: subscription.status,
      customerId: subscription.customer,
      priceId: subscription.items.data[0]?.price.id,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    },
  });

  try {
    // Look up the plan_id based on the price_id
    const priceId = subscription.items.data[0].price.id;

    const { data: plan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id, plan_name, monthly_email_limit")
      .eq("stripe_price_id", priceId)
      .single();

    if (planError) {
      logger.error("🚨 Error looking up plan for subscription creation", {
        prefix: "stripe/customer-portal",
        data: {
          error: planError,
          priceId,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Get the profile_id based on the customer ID
    const { data: existingSubscription, error: subError } = await supabaseAnon
      .from("subscriptions")
      .select("profile_id, status, id")
      .eq("stripe_customer_id", subscription.customer as string)
      .maybeSingle();

    if (subError) {
      logger.error("🚨 Error checking for existing subscription", {
        prefix: "stripe/customer-portal",
        data: {
          error: subError,
          customerId: subscription.customer,
        },
      });
      return;
    }

    // If no existing subscription is found, we can't determine the profile_id
    if (!existingSubscription?.profile_id) {
      logger.error("🚨 Could not determine profile_id for new subscription", {
        prefix: "stripe/customer-portal",
        data: {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Prepare the update data
    const subscriptionData = {
      status: subscription.status,
      plan_id: plan.id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      start_date: new Date(
        subscription.current_period_start * 1000
      ).toISOString(),
      end_date: new Date(subscription.current_period_end * 1000).toISOString(),
      usage_count: 0, // Reset usage for the new subscription
    };

    // Update the subscription in our database using upsert
    // This will create a new subscription or update an existing one
    const { error: upsertError } = await supabaseAnon
      .from("subscriptions")
      .upsert(
        {
          profile_id: existingSubscription.profile_id,
          ...subscriptionData,
        },
        {
          onConflict: "profile_id",
          ignoreDuplicates: false,
        }
      );

    if (upsertError) {
      logger.error("🚨 Failed to upsert subscription via Customer Portal", {
        prefix: "stripe/customer-portal",
        data: {
          error: upsertError,
          profileId: existingSubscription.profile_id,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    logger.info(
      "✅ Successfully processed new subscription via Customer Portal",
      {
        prefix: "stripe/customer-portal",
        data: {
          subscriptionId: subscription.id,
          profileId: existingSubscription.profile_id,
          planName: plan.plan_name,
          status: subscription.status,
        },
      }
    );
  } catch (error) {
    logger.error("🚨 Error in handleSubscriptionCreated", {
      prefix: "stripe/customer-portal",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}
