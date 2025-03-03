import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { STRIPE_SECRET_KEY } from "@/lib/constants";

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
  telemetry: false,
  maxNetworkRetries: 3,
});

// Add logging to debug the mode
logger.info("Stripe mode configuration", {
  prefix: "stripe/webhooks",
  data: {
    mode: STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "live",
  },
});

// Add these types at the top of the file
type Plan = {
  id: string;
  plan_name: string;
};

type SubscriptionWithPlan = {
  id: string;
  status: string;
  stripe_subscription_id: string;
  plans: Plan;
};

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
    logger.info(`📥 Received Stripe webhook: ${parsedBody.type}`, {
      prefix: "stripe/webhooks",
      data: {
        eventId: parsedBody.id,
        eventType: parsedBody.type,
        apiVersion: parsedBody.api_version,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.warn("⚠️ Could not parse webhook body for logging", {
      prefix: "stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown parsing error",
      },
    });
  }

  try {
    // Verify the signature
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // Log successful verification
    logger.info(`✓ Webhook signature verified: ${event.type}`, {
      prefix: "stripe/webhooks",
      data: {
        eventId: event.id,
      },
    });

    // Handle relevant event types
    switch (event.type) {
      case "customer.subscription.updated":
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;

      case "invoice.payment_succeeded":
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;

      case "customer.subscription.created":
        const newSubscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(newSubscription);
        break;

      case "invoice.payment_failed":
        const failedInvoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(failedInvoice);
        break;

      case "customer.subscription.deleted":
        const deletedSubscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(deletedSubscription);
        break;

      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;

      default:
        logger.info(`🔔 Unhandled event type ${event.type}`, {
          prefix: "🔔 stripe/webhooks",
        });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const error = err as Error;

    // Check if it's a signature verification error
    if (error.message?.includes("signature")) {
      logger.error("🚨 Invalid webhook signature", {
        prefix: "stripe/webhooks",
        data: {
          error: error.message,
          sig: sig?.substring(0, 32), // Log only first part of signature
        },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Other errors
    logger.error("🔥 Webhook processing failed", {
      prefix: "stripe/webhooks",
      data: {
        error: error.message,
        type: event?.type || "unknown",
      },
    });

    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  logger.info("🔄 Subscription updated", {
    prefix: "🔄 stripe/webhooks",
    data: {
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAt: subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      priceId: subscription.items.data[0].price.id,
      customerId: subscription.customer,
    },
  });

  try {
    // Look up the plan_id based on the price_id
    const priceId = subscription.items.data[0].price.id;

    const { data: plan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id, plan_name")
      .eq("stripe_price_id", priceId)
      .single();

    if (planError) {
      logger.error("🚨 Error looking up plan for subscription update", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: planError,
          priceId,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Get the profile_id and current subscription details
    const { data: subscriptionData } = await supabaseAnon
      .from("subscriptions")
      .select("profile_id, plan_id, status, id, stripe_subscription_id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (!subscriptionData?.profile_id) {
      logger.error("🚨 Couldn't find subscription record for update", {
        prefix: "🚨 stripe/webhooks",
        data: {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Get the current plan details
    const { data: currentPlan } = await supabaseAnon
      .from("plans")
      .select("id, plan_name")
      .eq("id", subscriptionData.plan_id)
      .single();

    // Log detailed information about the plans for debugging
    logger.info("🔍 Plan comparison details", {
      prefix: "stripe/webhooks",
      data: {
        newPlan: {
          id: plan?.id,
          name: plan?.plan_name,
          priceId: subscription.items.data[0].price.id,
        },
        currentPlan: {
          id: currentPlan?.id,
          name: currentPlan?.plan_name,
        },
        subscriptionDetails: {
          status: subscription.status,
          customerId: subscription.customer,
          subscriptionId: subscription.id,
          currentStripeSubId: subscriptionData.stripe_subscription_id,
        },
      },
    });

    // Check if this is a Basic to Pro upgrade
    const isBasicToProUpgrade =
      currentPlan?.plan_name?.toLowerCase() === "basic" &&
      plan?.plan_name?.toLowerCase() === "pro" &&
      subscription.status === "active";

    // For Basic to Pro upgrades, we want to:
    // 1. Cancel the old Basic subscription in Stripe (if it's different from the new one)
    // 2. Update the subscription record to Pro immediately
    if (isBasicToProUpgrade) {
      logger.info("🔄 Processing immediate Basic to Pro upgrade", {
        prefix: "stripe/webhooks",
        data: {
          profileId: subscriptionData.profile_id,
          fromPlan: currentPlan?.plan_name,
          toPlan: plan?.plan_name,
          oldSubscriptionId: subscriptionData.stripe_subscription_id,
          newSubscriptionId: subscription.id,
        },
      });

      // If the new subscription is different from the current one, cancel the old one
      if (subscriptionData.stripe_subscription_id !== subscription.id) {
        try {
          await stripe.subscriptions.cancel(
            subscriptionData.stripe_subscription_id
          );
          logger.info("✅ Successfully canceled old Basic subscription", {
            prefix: "stripe/webhooks",
            data: {
              oldSubscriptionId: subscriptionData.stripe_subscription_id,
            },
          });
        } catch (cancelError) {
          logger.warn(
            "⚠️ Failed to cancel old Basic subscription, but continuing with upgrade",
            {
              prefix: "stripe/webhooks",
              data: {
                error:
                  cancelError instanceof Error
                    ? cancelError.message
                    : "Unknown error",
                oldSubscriptionId: subscriptionData.stripe_subscription_id,
              },
            }
          );
        }
      }

      // Update the subscription to Pro
      const { error: updateError } = await supabaseAnon
        .from("subscriptions")
        .update({
          plan_id: plan.id,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer as string,
          status: subscription.status,
          start_date: new Date().toISOString(),
          end_date: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          usage_count: 0,
        })
        .eq("profile_id", subscriptionData.profile_id);

      if (updateError) {
        logger.error(
          "🚨 Failed to update subscription for Basic to Pro upgrade",
          {
            prefix: "stripe/webhooks",
            data: {
              error: updateError,
              profileId: subscriptionData.profile_id,
            },
          }
        );
        return;
      }

      logger.info("✅ Successfully processed Basic to Pro upgrade", {
        prefix: "stripe/webhooks",
        data: {
          profileId: subscriptionData.profile_id,
          fromPlan: currentPlan?.plan_name,
          toPlan: plan?.plan_name,
          oldSubscriptionId: subscriptionData.stripe_subscription_id,
          newSubscriptionId: subscription.id,
          status: subscription.status,
        },
      });

      return;
    }

    // For all other updates, prepare update object with required fields
    const updateData: {
      status: string;
      end_date: string;
      stripe_subscription_id: string;
      plan_id?: string;
    } = {
      status: subscription.status,
      end_date: new Date(subscription.current_period_end * 1000).toISOString(),
      stripe_subscription_id: subscription.id,
    };

    // Add plan_id if we found it
    if (plan?.id) {
      updateData.plan_id = plan.id;
    }

    // Use upsert to handle potential race conditions
    const { error: updateError } = await supabaseAnon
      .from("subscriptions")
      .upsert(
        {
          profile_id: subscriptionData.profile_id,
          ...updateData,
          stripe_customer_id: subscription.customer as string,
        },
        {
          onConflict: "profile_id",
          ignoreDuplicates: false,
        }
      );

    if (updateError) {
      logger.error("🚨 Failed to update subscription", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: updateError,
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    logger.info("✅ Successfully updated subscription", {
      prefix: "stripe/webhooks",
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        planId: plan?.id || "unknown",
        customerId: subscription.customer,
        profileId: subscriptionData.profile_id,
      },
    });
  } catch (error) {
    logger.error("🚨 Error in handleSubscriptionUpdate", {
      prefix: "🚨 stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}

// Handle payment succeeded
// This is called when a payment is successfully made
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  logger.info("✅ Invoice payment succeeded", {
    prefix: "✅ stripe/webhooks",
    data: {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      periodStart: new Date(invoice.period_start * 1000).toISOString(),
      periodEnd: new Date(invoice.period_end * 1000).toISOString(),
    },
  });

  // Skip non-subscription invoices
  if (!invoice.subscription) {
    logger.info("📝 Skipping non-subscription invoice", {
      prefix: "stripe/webhooks",
      data: { invoiceId: invoice.id },
    });
    return;
  }

  try {
    // Log invoice lines for debugging
    logger.debug("🔍 Invoice lines data", {
      prefix: "stripe/webhooks",
      data: {
        invoiceId: invoice.id,
        lines: invoice.lines.data.map((line) => ({
          priceId: line.price?.id,
          productId: line.price?.product,
          amount: line.amount,
          description: line.description,
        })),
      },
    });

    // Direct lookup by price_id - simpler approach
    const { data: plan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id")
      .eq("stripe_price_id", invoice.lines.data[0].price?.id)
      .single();

    if (planError || !plan) {
      logger.error("🚨 Plan not found for invoice", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: planError,
          invoiceId: invoice.id,
          priceId: invoice.lines.data[0].price?.id,
        },
      });
      return;
    }

    // IMPROVED: First try to find the subscription by stripe_subscription_id
    // This is more reliable than looking up by customer ID
    const { data: subscriptionByStripeId, error: subByIdError } =
      await supabaseAnon
        .from("subscriptions")
        .select("profile_id, status")
        .eq("stripe_subscription_id", invoice.subscription as string)
        .maybeSingle();

    logger.debug("🔍 Subscription lookup by stripe_subscription_id", {
      prefix: "stripe/webhooks",
      data: {
        subscriptionId: invoice.subscription,
        found: !!subscriptionByStripeId,
        currentStatus: subscriptionByStripeId?.status,
        lookupError: subByIdError,
      },
    });

    let profileId: string | null = null;

    // If we found the subscription by Stripe ID, use that profile_id
    if (subscriptionByStripeId?.profile_id) {
      profileId = subscriptionByStripeId.profile_id;
      logger.info("✓ Found subscription by stripe_subscription_id", {
        prefix: "stripe/webhooks",
        data: {
          subscriptionId: invoice.subscription,
          profileId,
          currentStatus: subscriptionByStripeId.status,
        },
      });
    } else {
      // Fallback to previous methods if not found by subscription ID
      // Get the profile_id from customer metadata
      const customerResponse = await stripe.customers.retrieve(
        invoice.customer as string
      );

      // Log customer data for debugging
      logger.debug("🔍 Customer data retrieved", {
        prefix: "stripe/webhooks",
        data: {
          customerId: invoice.customer,
          hasMetadata:
            !("deleted" in customerResponse) && !!customerResponse.metadata,
          profileIdInMetadata:
            !("deleted" in customerResponse) &&
            customerResponse.metadata?.profile_id,
        },
      });

      if (
        !("deleted" in customerResponse) &&
        customerResponse.metadata?.profile_id
      ) {
        profileId = customerResponse.metadata.profile_id;
      } else {
        // Last resort: database lookup by customer ID
        const { data: subscription, error: subError } = await supabaseAnon
          .from("subscriptions")
          .select("profile_id, status")
          .eq("stripe_customer_id", invoice.customer as string)
          .single();

        // Log database lookup results
        logger.debug("🔍 Database lookup for profile_id by customer_id", {
          prefix: "stripe/webhooks",
          data: {
            customerId: invoice.customer,
            foundSubscription: !!subscription,
            subscriptionStatus: subscription?.status,
            error: subError,
          },
        });

        if (subscription?.profile_id) {
          profileId = subscription.profile_id;
        }
      }
    }

    if (!profileId) {
      logger.error("🚨 No profile_id found for customer or subscription", {
        prefix: "🚨 stripe/webhooks",
        data: {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: invoice.subscription,
        },
      });
      return;
    }

    // Check current subscription status before updating
    const { data: currentSub, error: currentSubError } = await supabaseAnon
      .from("subscriptions")
      .select("status, plan_id")
      .eq("profile_id", profileId)
      .single();

    logger.info("📝 Current subscription before update", {
      prefix: "stripe/webhooks",
      data: {
        profileId,
        currentStatus: currentSub?.status || "not found",
        currentPlanId: currentSub?.plan_id || "not found",
        newPlanId: plan.id,
        lookupError: currentSubError,
      },
    });

    // IMPROVED: Make sure we're updating the correct subscription by checking both
    // profile_id AND stripe_subscription_id when we update
    const { error } = await supabaseAnon
      .from("subscriptions")
      .update({
        status: "active", // Force to active on payment success
        start_date: new Date(invoice.period_start * 1000).toISOString(),
        end_date: new Date(invoice.period_end * 1000).toISOString(),
        usage_count: 0, // Reset usage counter on successful payment,
        plan_id: plan.id,
        stripe_subscription_id: invoice.subscription as string, // Ensure this is set correctly
      })
      .eq("profile_id", profileId)
      .eq("stripe_subscription_id", invoice.subscription as string);

    if (error) {
      // If the above query fails, try a more lenient update using just profile_id
      // This handles cases where the subscription ID might have changed
      logger.warn(
        "⚠️ Could not update with both profile_id and subscription_id, trying profile_id only",
        {
          prefix: "stripe/webhooks",
          data: {
            error,
            invoiceId: invoice.id,
            profileId,
            subscriptionId: invoice.subscription,
          },
        }
      );

      const { error: secondError } = await supabaseAnon
        .from("subscriptions")
        .update({
          status: "active", // Force to active on payment success
          start_date: new Date(invoice.period_start * 1000).toISOString(),
          end_date: new Date(invoice.period_end * 1000).toISOString(),
          usage_count: 0, // Reset usage counter on successful payment,
          plan_id: plan.id,
          stripe_subscription_id: invoice.subscription as string, // Ensure this is set correctly
        })
        .eq("profile_id", profileId);

      if (secondError) {
        logger.error("🚨 Failed to update subscription after both attempts", {
          prefix: "🚨 stripe/webhooks",
          data: {
            error: secondError,
            invoiceId: invoice.id,
            profileId,
          },
        });
        return;
      }
    }

    logger.info("✅ Successfully updated subscription after payment", {
      prefix: "stripe/webhooks",
      data: {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        subscriptionId: invoice.subscription,
        planId: plan.id,
        profileId,
        fromStatus: currentSub?.status || "unknown",
        toStatus: "active",
      },
    });
  } catch (error) {
    logger.error("🚨 Failed to handle payment success", {
      prefix: "🚨 stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        invoiceId: invoice.id,
      },
    });
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  logger.info("🎉 Subscription created", {
    prefix: "🎉 stripe/webhooks",
    data: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      priceId: subscription.items.data[0].price.id,
      status: subscription.status,
      currentPeriodEnd: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
    },
  });

  try {
    // First, check if this subscription has already been processed
    // This could happen if handleCheckoutCompleted already handled it
    const { data: existingSubscription, error: lookupError } =
      await supabaseAnon
        .from("subscriptions")
        .select("id, status, stripe_subscription_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();

    if (lookupError) {
      logger.warn("⚠️ Error checking for existing subscription", {
        prefix: "stripe/webhooks",
        data: {
          error: lookupError,
          subscriptionId: subscription.id,
        },
      });
      // Continue despite the error - worst case we might duplicate processing
    }

    // If subscription already exists with the same ID and has an active or trialing status,
    // it was likely already processed by handleCheckoutCompleted, so we can skip
    if (
      existingSubscription?.stripe_subscription_id === subscription.id &&
      ["active", "trialing"].includes(existingSubscription.status)
    ) {
      // Special case: If the new status is problematic (incomplete/past_due/unpaid),
      // we should update the status to reflect the latest state
      if (["incomplete", "past_due", "unpaid"].includes(subscription.status)) {
        logger.info("📝 Updating subscription status only", {
          prefix: "stripe/webhooks",
          data: {
            subscriptionId: subscription.id,
            prevStatus: existingSubscription.status,
            newStatus: subscription.status,
          },
        });

        // Update just the status
        const { error: statusUpdateError } = await supabaseAnon
          .from("subscriptions")
          .update({ status: subscription.status })
          .eq("stripe_subscription_id", subscription.id);

        if (statusUpdateError) {
          logger.error("🚨 Failed to update subscription status", {
            prefix: "🚨 stripe/webhooks",
            data: {
              error: statusUpdateError,
              subscriptionId: subscription.id,
            },
          });
        }

        return;
      }

      // For non-problematic statuses, skip processing entirely
      logger.info("📝 Skipping subscription creation - already processed", {
        prefix: "stripe/webhooks",
        data: {
          subscriptionId: subscription.id,
          existingStatus: existingSubscription.status,
          newStatus: subscription.status,
        },
      });
      return;
    }

    // Otherwise, proceed with normal processing
    // Fetch customer to get metadata
    const customerResponse = await stripe.customers.retrieve(
      subscription.customer as string
    );

    // Find the plan in our database
    const { data: plan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id")
      .eq("stripe_price_id", subscription.items.data[0].price.id)
      .single();

    if (planError) {
      logger.error("🚨 Error getting plan id", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: planError,
          priceId: subscription.items.data[0].price.id,
        },
      });
      return;
    }

    // We need to find the profile_id associated with this customer
    // First, try to look it up from existing subscriptions
    const { data: existingSub } = await supabaseAnon
      .from("subscriptions")
      .select("profile_id")
      .eq("stripe_customer_id", subscription.customer as string)
      .maybeSingle();

    // If we couldn't find an existing subscription, try to extract profile_id from customer metadata
    // This assumes you set it during checkout or customer creation
    let profileId: string | null = null;

    if (existingSub?.profile_id) {
      profileId = existingSub.profile_id;
    } else if (
      !("deleted" in customerResponse) &&
      customerResponse.metadata?.profile_id
    ) {
      // Only access metadata if customer is not deleted
      profileId = customerResponse.metadata.profile_id as string;
    }

    if (!profileId) {
      logger.error("🚨 Could not determine profile_id for subscription", {
        prefix: "🚨 stripe/webhooks",
        data: {
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    // Now we can upsert the subscription
    const { error: upsertError } = await supabaseAnon
      .from("subscriptions")
      .upsert(
        {
          profile_id: profileId,
          plan_id: plan.id,
          status: subscription.status,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer as string,
          start_date: new Date(
            subscription.current_period_start * 1000
          ).toISOString(),
          end_date: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
          usage_count: 0, // Reset usage counter for the new subscription
        },
        {
          onConflict: "profile_id", // This matches the constraint
          ignoreDuplicates: false, // We want to update existing records
        }
      );

    if (upsertError) {
      logger.error("🚨 Failed to upsert subscription", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: upsertError,
          profileId,
          customerId: subscription.customer,
          subscriptionId: subscription.id,
        },
      });
      return;
    }

    logger.info("✅ Successfully processed subscription creation", {
      prefix: "stripe/webhooks",
      data: {
        profileId,
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        planId: plan.id,
        status: subscription.status,
      },
    });
  } catch (error) {
    logger.error("🚨 Failed to create subscription", {
      prefix: "🚨 stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  logger.warn("❌ Payment failed", {
    prefix: "❌ stripe/webhooks",
    data: {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amountDue: invoice.amount_due,
      attemptCount: invoice.attempt_count,
      nextPaymentAttempt: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : null,
    },
  });

  try {
    // Update subscription status and notify user
    const { error } = await supabaseAnon
      .from("subscriptions")
      .update({
        status: "past_due",
      })
      .eq("stripe_customer_id", invoice.customer as string);

    if (error) {
      logger.error("🚨 Update failed", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: error as Error,
          invoiceId: invoice.id,
        },
      });
      return; // Stop execution
    }
  } catch (error) {
    logger.error("🛑 Failed to handle payment failure", {
      prefix: "🛑 stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        invoiceId: invoice.id,
      },
    });
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  logger.info("🗑️ Subscription deleted", {
    prefix: "🗑️ stripe/webhooks",
    data: {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      cancellationReason: subscription.cancellation_details?.reason,
      endedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000).toISOString()
        : null,
    },
  });

  try {
    // Get profile ID from customer ID
    const { data: subscriptionData, error: fetchError } = await supabaseAnon
      .from("subscriptions")
      .select(
        "profile_id, stripe_customer_id, plan_id, id, status, stripe_subscription_id"
      )
      .eq("stripe_customer_id", subscription.customer as string)
      .single();

    if (fetchError) {
      // Check if this is a "no rows returned" error, which means there's no subscription to delete
      if (fetchError.code === "PGRST116") {
        logger.info("ℹ️ No subscription found to delete", {
          prefix: "stripe/webhooks",
          data: {
            customerId: subscription.customer,
            subscriptionId: subscription.id,
            message:
              "Webhook received for subscription deletion, but no matching subscription found in database.",
          },
        });
      } else {
        logger.error("🚨 Error finding subscription record", {
          prefix: "🚨 stripe/webhooks",
          data: {
            error: fetchError,
            customerId: subscription.customer,
            subscriptionId: subscription.id,
          },
        });
      }
      return;
    }

    // Check if there's an active Pro subscription that's different from the one being deleted
    const { data: activeSubscriptions } = (await supabaseAnon
      .from("subscriptions")
      .select(
        `
        id,
        status,
        stripe_subscription_id,
        plans:plan_id (
          id,
          plan_name
        )
      `
      )
      .eq("profile_id", subscriptionData.profile_id)
      .eq("status", "active")
      .neq("stripe_subscription_id", subscription.id)) as {
      data: SubscriptionWithPlan[] | null;
    };

    // Log the active subscriptions for debugging
    logger.info("🔍 Checking active subscriptions during deletion", {
      prefix: "stripe/webhooks",
      data: {
        deletedSubscriptionId: subscription.id,
        activeSubscriptions: activeSubscriptions?.map((sub) => ({
          id: sub.id,
          status: sub.status,
          planName: sub.plans.plan_name,
          stripeSubId: sub.stripe_subscription_id,
        })),
      },
    });

    // If there's an active Pro subscription, don't switch to Free
    const hasActivePro = activeSubscriptions?.some(
      (sub) =>
        sub.plans.plan_name.toLowerCase() === "pro" && sub.status === "active"
    );

    if (hasActivePro) {
      logger.info(
        "📝 Skipping switch to Free plan - active Pro subscription exists",
        {
          prefix: "stripe/webhooks",
          data: {
            deletedSubscriptionId: subscription.id,
            profileId: subscriptionData.profile_id,
          },
        }
      );
      return;
    }

    // Get the plan name of the current subscription
    const { data: currentPlan } = await supabaseAnon
      .from("plans")
      .select("plan_name")
      .eq("id", subscriptionData.plan_id)
      .single();

    // Check if there's a pending plan switch
    const { data: pendingPlan, error: pendingPlanError } = await supabaseAnon
      .from("pending_plans")
      .select("*")
      .eq("profile_id", subscriptionData.profile_id)
      .maybeSingle();

    if (pendingPlanError) {
      logger.error("🚨 Error checking for pending plan", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: pendingPlanError,
          profileId: subscriptionData.profile_id,
        },
      });
    }

    // Get the pending plan name if it exists
    if (pendingPlan?.next_plan_id) {
      const { data: pendingPlanDetails } = await supabaseAnon
        .from("plans")
        .select("plan_name")
        .eq("id", pendingPlan.next_plan_id)
        .single();

      // We don't need to store this since we're not using it
      if (!pendingPlanDetails) {
        logger.warn("⚠️ Could not find pending plan details", {
          prefix: "stripe/webhooks",
          data: {
            pendingPlanId: pendingPlan.next_plan_id,
          },
        });
      }
    }

    // IMPORTANT: First, mark the current subscription as cancelled
    const { error: cancelError } = await supabaseAnon
      .from("subscriptions")
      .update({
        status: "canceled",
      })
      .eq("id", subscriptionData.id);

    if (cancelError) {
      logger.error("🚨 Error marking subscription as cancelled", {
        prefix: "🚨 stripe/webhooks",
        data: {
          error: cancelError,
          subscriptionId: subscriptionData.id,
        },
      });
      return;
    }

    // Only switch to Free plan if there's no active Pro and no pending plan switch
    if (!pendingPlan && !hasActivePro) {
      // Find the Free plan
      const { data: freePlan, error: planError } = await supabaseAnon
        .from("plans")
        .select("id")
        .eq("plan_name", "Free")
        .single();

      if (planError) {
        logger.error("🚨 Error getting free plan id", {
          prefix: "🚨 stripe/webhooks",
          data: { error: planError },
        });
        return;
      }

      const { error: updateError } = await supabaseAnon
        .from("subscriptions")
        .update({
          plan_id: freePlan.id,
          status: "active",
          end_date: null,
          usage_count: 0,
        })
        .eq("profile_id", subscriptionData.profile_id);

      if (updateError) {
        logger.error("🚨 Failed to update to free plan", {
          prefix: "🚨 stripe/webhooks",
          data: {
            error: updateError,
            profileId: subscriptionData.profile_id,
          },
        });
        return;
      }

      logger.info("✅ Successfully switched to free plan", {
        prefix: "stripe/webhooks",
        data: {
          customerId: subscription.customer,
          profileId: subscriptionData.profile_id,
          previousCustomerId: subscriptionData.stripe_customer_id,
          fromPlan: currentPlan?.plan_name?.toLowerCase(),
          toPlan: "Free",
          reason:
            subscription.cancellation_details?.reason || "Manual cancellation",
        },
      });
    } else {
      logger.info(
        "📝 Subscription marked as cancelled - no switch to Free plan",
        {
          prefix: "stripe/webhooks",
          data: {
            profileId: subscriptionData.profile_id,
            subscriptionId: subscription.id,
            hasPendingPlan: !!pendingPlan,
            hasActivePro,
          },
        }
      );
    }
  } catch (error) {
    logger.error("🚨 Failed to handle subscription deletion", {
      prefix: "🚨 stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        subscriptionId: subscription.id,
      },
    });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  logger.info("🛒 Checkout completed", {
    prefix: "stripe/webhooks",
    data: {
      sessionId: session.id,
      customerId: session.customer,
      subscriptionId: session.subscription,
      clientReferenceId: session.client_reference_id,
    },
  });

  // Make sure we have required data
  if (!session.customer || !session.subscription) {
    logger.error("🚨 Missing customer or subscription in checkout session", {
      prefix: "stripe/webhooks",
      data: { sessionId: session.id },
    });
    return;
  }

  // Get the profile ID from client_reference_id
  const profileId = session.client_reference_id;

  if (!profileId) {
    logger.error("🚨 Missing profileId in checkout session", {
      prefix: "stripe/webhooks",
      data: { sessionId: session.id },
    });
    return;
  }

  try {
    // Get subscription details to find the plan
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string
    );

    // Find the plan in our database
    const { data: plan, error: planError } = await supabaseAnon
      .from("plans")
      .select("id")
      .eq("stripe_price_id", subscription.items.data[0].price.id)
      .single();

    if (planError) {
      logger.error("🚨 Error getting plan id for checkout", {
        prefix: "stripe/webhooks",
        data: {
          error: planError,
          priceId: subscription.items.data[0].price.id,
        },
      });
      return;
    }

    // Use upsert pattern to handle the one_active_subscription_per_profile constraint
    const { error: upsertError } = await supabaseAnon
      .from("subscriptions")
      .upsert(
        {
          profile_id: profileId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          plan_id: plan.id,
          status: subscription.status,
          usage_count: 0, // Reset usage counter on new/updated subscription
          start_date: new Date(
            subscription.current_period_start * 1000
          ).toISOString(),
          end_date: new Date(
            subscription.current_period_end * 1000
          ).toISOString(),
        },
        {
          onConflict: "profile_id", // This matches the constraint field
          ignoreDuplicates: false, // We want to update existing records
        }
      );

    if (upsertError) {
      logger.error("🚨 Error upserting subscription after checkout", {
        prefix: "stripe/webhooks",
        data: { error: upsertError, profileId },
      });
      return;
    }

    logger.info("✅ Successfully processed checkout session with upsert", {
      prefix: "stripe/webhooks",
      data: {
        sessionId: session.id,
        profileId,
        customerId: session.customer,
        subscriptionId: session.subscription,
      },
    });
  } catch (error) {
    logger.error("🚨 Failed to process checkout session", {
      prefix: "stripe/webhooks",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        sessionId: session.id,
      },
    });
  }
}
