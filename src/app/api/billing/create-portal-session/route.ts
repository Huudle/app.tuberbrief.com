import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAnon } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { STRIPE_SECRET_KEY } from "@/lib/constants";

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function GET(request: Request) {
  try {
    // Log the incoming request
    const authHeader = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");

    logger.debug("Customer portal session request received", {
      prefix: "API/billing/create-portal-session",
      data: {
        hasAuthHeader: !!authHeader,
        hasCookies: !!cookieHeader,
      },
    });

    // Extract the bearer token if available
    let accessToken = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    }

    // Look for auth cookie if no bearer token
    if (!accessToken && cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      const authCookie = cookies.find((c) => c.startsWith("tuber-brief-auth="));

      if (authCookie) {
        try {
          const cookieValue = authCookie.substring("tuber-brief-auth=".length);
          const sessionData = JSON.parse(decodeURIComponent(cookieValue));

          if (sessionData?.access_token) {
            accessToken = sessionData.access_token;
          }
        } catch (e) {
          logger.warn("Error parsing auth cookie", {
            prefix: "API/billing/create-portal-session",
            data: {
              error: e instanceof Error ? e.message : "Unknown parsing error",
            },
          });
        }
      }
    }

    // Try to authenticate with the token if provided
    let user = null;
    let userError = null;

    if (accessToken) {
      // Use the access token to get the user
      const { data, error } = await supabaseAnon.auth.getUser(accessToken);
      user = data.user;
      userError = error;
    }

    // If token auth failed or no token, try session-based auth
    if (!user) {
      // Set the Supabase auth session from cookie if available
      if (cookieHeader) {
        try {
          await supabaseAnon.auth.setSession({
            access_token: accessToken || "",
            refresh_token: "",
          });
        } catch (e) {
          logger.warn("Error setting session", {
            prefix: "API/billing/create-portal-session",
            data: {
              error: e instanceof Error ? e.message : "Unknown error",
            },
          });
        }
      }

      // Fallback to session-based auth
      const { data, error } = await supabaseAnon.auth.getUser();
      user = data.user;
      userError = error;
    }

    if (userError || !user) {
      logger.error("Unauthorized access attempt to billing portal API", {
        prefix: "API/billing/create-portal-session",
        data: {
          error: userError?.message || "No authenticated user",
        },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profileId = user.id;

    // Get Stripe customer ID from the user's subscription
    const { data: subscription, error: subscriptionError } = await supabaseAnon
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", profileId)
      .single();

    if (subscriptionError || !subscription?.stripe_customer_id) {
      logger.error("Failed to find Stripe customer ID", {
        prefix: "API/billing/create-portal-session",
        data: {
          profileId,
          error: subscriptionError?.message || "No customer ID found",
        },
      });
      return NextResponse.json(
        { error: "No subscription found" },
        { status: 404 }
      );
    }

    const customerId = subscription.stripe_customer_id;

    // Get the base URL with proper scheme
    let baseUrl = request.headers.get("origin");
    if (!baseUrl) {
      // Try to get from referer
      const referer = request.headers.get("referer");
      if (referer) {
        const refererUrl = new URL(referer);
        baseUrl = `${refererUrl.protocol}//${refererUrl.host}`;
      }
    }

    // Fallback to environment variable or hardcoded value if no origin/referer found
    if (!baseUrl) {
      baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.NODE_ENV === "production"
          ? "https://app.tuberbrief.com"
          : "http://localhost:3000");
    }

    // Ensure the base URL has a scheme
    if (!baseUrl.startsWith("http")) {
      baseUrl = `https://${baseUrl}`;
    }

    logger.debug("Creating portal session", {
      prefix: "API/billing/create-portal-session",
      data: {
        customerId,
        returnUrl: `${baseUrl}/dashboard/billing`,
        action: request.url.includes("plan=change")
          ? "change_plan"
          : request.url.includes("action=cancel")
          ? "cancel"
          : "general",
      },
    });

    // Determine which flow to show based on URL parameters
    const urlParams = new URL(request.url).searchParams;
    const action = urlParams.get("action");
    const planChange = urlParams.get("plan") === "change";
    const priceId = urlParams.get("priceId");

    // Get the subscription ID for this customer
    let subscriptionId: string | undefined;
    try {
      const customer = (await stripe.customers.retrieve(customerId, {
        expand: ["subscriptions"],
      })) as Stripe.Customer;

      subscriptionId = customer.subscriptions?.data[0]?.id;

      if (!subscriptionId) {
        logger.warn("No active subscription found for customer", {
          prefix: "API/billing/create-portal-session",
          data: { customerId },
        });
      } else {
        logger.debug("Found subscription for customer", {
          prefix: "API/billing/create-portal-session",
          data: { customerId, subscriptionId },
        });
      }
    } catch (error) {
      logger.error("Error retrieving customer subscriptions", {
        prefix: "API/billing/create-portal-session",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
          customerId,
        },
      });
    }

    // Set up portal configuration options
    const portalOptions: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${baseUrl}/dashboard/billing`,
    };

    // Add configuration ID if available
    if (process.env.STRIPE_PORTAL_CONFIGURATION_ID) {
      portalOptions.configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
    }

    // Set up specific flows based on action
    if (planChange && subscriptionId) {
      portalOptions.flow_data = {
        type: "subscription_update",
        subscription_update: {
          subscription: subscriptionId,
        },
      };

      // If a specific price ID is provided, log that we received it
      // Unfortunately, the Stripe Portal API doesn't directly support pre-selecting prices
      // in the subscription_update flow as of this API version
      if (priceId) {
        logger.debug("Received priceId parameter for subscription update", {
          prefix: "API/billing/create-portal-session",
          data: {
            subscriptionId,
            priceId,
            note: "The Stripe Portal API doesn't currently support pre-selecting prices in the subscription_update flow",
          },
        });

        // We will redirect to the portal, but the user will still need to select the plan manually
        // A future enhancement could include adding custom parameters to the return URL
        // so the frontend could display which plan the user originally selected
      }
    } else if (action === "cancel" && subscriptionId) {
      portalOptions.flow_data = {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: subscriptionId,
        },
      };
    }

    // Create Stripe customer portal session with enhanced options
    const portalSession = await stripe.billingPortal.sessions.create(
      portalOptions
    );

    // Redirect to the portal URL
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logger.error("Error creating Stripe portal session", {
      prefix: "API/billing/create-portal-session",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
