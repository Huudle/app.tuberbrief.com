import Stripe from "stripe";
import { logger } from "@/lib/logger";
import { STRIPE_SECRET_KEY } from "@/lib/constants";

const stripe = new Stripe(STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

/**
 * Utility to get or create a Stripe customer consistently across the application.
 * This ensures we don't create duplicate customers for the same user.
 */
export async function getOrCreateStripeCustomer({
  existingCustomerId,
  profileId,
  email,
  firstName,
  lastName,
  source = "stripe-utils",
}: {
  existingCustomerId?: string | null;
  profileId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  source?: string;
}): Promise<string> {
  // Try to use existing customer if available
  if (existingCustomerId && existingCustomerId !== "undefined") {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);

      // Check if customer was deleted
      if (customer.deleted) {
        logger.warn("Customer was deleted, will create new one", {
          prefix: source,
          data: { customerId: existingCustomerId },
        });
        // Continue to search/create
      } else {
        // Customer exists and is valid, make sure metadata is up to date
        if (
          !customer.metadata?.profile_id ||
          customer.metadata.profile_id !== profileId
        ) {
          await stripe.customers.update(existingCustomerId, {
            metadata: {
              ...customer.metadata,
              profile_id: profileId,
              updated_at: new Date().toISOString(),
            },
          });

          logger.info("Updated existing customer metadata", {
            prefix: source,
            data: { customerId: existingCustomerId, profileId },
          });
        }

        return customer.id;
      }
    } catch (error) {
      logger.warn("Failed to retrieve valid customer", {
        prefix: source,
        data: {
          customerId: existingCustomerId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
      // Continue to search/create
    }
  }

  // Search for active customers with matching email AND user ID metadata
  try {
    const existingCustomers = await stripe.customers.search({
      query: `email:"${email}" AND metadata['profile_id']:"${profileId}"`,
      limit: 1,
    });

    // Use matching customer if found and valid
    if (existingCustomers.data.length > 0) {
      const customer = existingCustomers.data[0];
      if (!customer.deleted) {
        logger.info("Found existing customer by email and user ID", {
          prefix: source,
          data: { customerId: customer.id, email, profileId },
        });
        return customer.id;
      }
    }
  } catch (error) {
    logger.warn("Error searching for existing customer", {
      prefix: source,
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        email,
        profileId,
      },
    });
    // Continue to create new customer
  }

  // If no valid customer found, create new one with metadata
  const customerName = `${firstName || ""} ${lastName || ""}`.trim();
  const customer = await stripe.customers.create({
    email,
    name: customerName || undefined,
    metadata: {
      profile_id: profileId,
      created_at: new Date().toISOString(),
      source,
      first_name: firstName || "",
      last_name: lastName || "",
    },
  });

  logger.info("Created new Stripe customer", {
    prefix: source,
    data: {
      customerId: customer.id,
      metadata: customer.metadata,
    },
  });

  return customer.id;
}

export { stripe };
