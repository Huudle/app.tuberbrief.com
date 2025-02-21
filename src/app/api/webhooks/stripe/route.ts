import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia",
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

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

      case "setup_intent.succeeded":
        const setupIntent = event.data.object as Stripe.SetupIntent;
        await handleSetupIntentSucceeded(setupIntent);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Webhook Error: ${err as Error}.message`);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 400 }
    );
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  await supabaseAnon
    .from("subscriptions")
    .update({
      status: subscription.status,
      end_date: new Date(subscription.current_period_end * 1000).toISOString(),
      stripe_subscription_id: subscription.id,
    })
    .eq("stripe_customer_id", subscription.customer as string);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  await supabaseAnon
    .from("subscriptions")
    .update({
      status: "active",
      start_date: new Date(invoice.period_start * 1000).toISOString(),
      end_date: new Date(invoice.period_end * 1000).toISOString(),
      usage_count: 0, // Reset usage counter
    })
    .eq("stripe_customer_id", invoice.customer as string);
}

async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  /*
  Data: {
  "setupIntent": {
    "id": "seti_1QuxS0Klx5sv2jxX0SvPAP0x",
    "object": "setup_intent",
    "application": null,
    "automatic_payment_methods": null,
    "cancellation_reason": null,
    "client_secret": "seti_1QuxS0Klx5sv2jxX0SvPAP0x_secret_RoadfhKJpdeotm0GSC84K0JFFFBWId3",
    "created": 1740149016,
    "customer": "cus_RoCcBhUBa0vMi0",
    "description": null,
    "flow_directions": null,
    "last_setup_error": null,
    "latest_attempt": "setatt_1QuxSKKlx5sv2jxXVOJsWAlk",
    "livemode": false,
    "mandate": null,
    "metadata": {},
    "next_action": null,
    "on_behalf_of": null,
    "payment_method": "pm_1QuxSKKlx5sv2jxXd0VxGvy4",
    "payment_method_configuration_details": null,
    "payment_method_options": {
      "card": {
        "mandate_options": null,
        "network": null,
        "request_three_d_secure": "automatic"
      }
    },
    "payment_method_types": [
      "card"
    ],
    "single_use_mandate": null,
    "status": "succeeded",
    "usage": "off_session"
  }
}
  */
  logger.info("Setup intent succeeded", {
    prefix: "stripe/webhooks",
    data: { setupIntent },
  });
}
