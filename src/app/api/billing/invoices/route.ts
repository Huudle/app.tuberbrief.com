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
});

export interface InvoiceResponse {
  id: string;
  date: number;
  amount: number;
  status: string;
  description: string;
  pdf: string | null;
  invoice_url: string | null;
}

export interface PaginatedInvoicesResponse {
  invoices: InvoiceResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function GET(request: Request) {
  try {
    // Parse URL for pagination parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "10", 10);

    // Validate and clamp pagination parameters
    const validPage = Math.max(1, page); // Ensure page is at least 1
    const validLimit = Math.min(Math.max(1, limit), 100); // Limit between 1 and 100

    // Log the incoming request headers for debugging
    const authHeader = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");

    logger.debug("Billing API request received", {
      prefix: "API/billing/invoices",
      data: {
        hasAuthHeader: !!authHeader,
        hasCookies: !!cookieHeader,
        cookieLength: cookieHeader?.length || 0,
        url: request.url,
        method: request.method,
        page: validPage,
        limit: validLimit,
      },
    });

    // Extract the bearer token if available
    let accessToken = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
      logger.debug("Found Bearer token in Authorization header", {
        prefix: "API/billing/invoices",
        data: {
          tokenLength: accessToken.length,
        },
      });
    }

    // Look for auth cookie if no bearer token
    if (!accessToken && cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      const authCookie = cookies.find((c) => c.startsWith("flow-fusion-auth="));

      if (authCookie) {
        try {
          const cookieValue = authCookie.substring("flow-fusion-auth=".length);
          const sessionData = JSON.parse(decodeURIComponent(cookieValue));

          if (sessionData?.access_token) {
            accessToken = sessionData.access_token;
            logger.debug("Found access token in cookie", {
              prefix: "API/billing/invoices",
              data: {
                tokenLength: accessToken.length,
              },
            });
          }
        } catch (e) {
          logger.warn("Error parsing auth cookie", {
            prefix: "API/billing/invoices",
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

      logger.debug("Auth with token result", {
        prefix: "API/billing/invoices",
        data: {
          hasUser: !!user,
          userId: user?.id,
          hasError: !!error,
          errorMessage: error?.message,
        },
      });
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
            prefix: "API/billing/invoices",
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

      logger.debug("Auth with session fallback result", {
        prefix: "API/billing/invoices",
        data: {
          hasUser: !!user,
          userId: user?.id,
          hasError: !!error,
          errorMessage: error?.message,
        },
      });
    }

    if (userError || !user) {
      logger.error("Unauthorized access attempt to billing API", {
        prefix: "API/billing/invoices",
        data: {
          error: userError?.message || "No authenticated user",
        },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profileId = user.id;

    logger.debug("Fetching invoices for profile", {
      prefix: "API/billing/invoices",
      data: {
        profileId,
        page: validPage,
        limit: validLimit,
      },
    });

    // Get Stripe customer ID from the user's subscription
    const { data: subscription, error: subscriptionError } = await supabaseAnon
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", profileId)
      .single();

    if (subscriptionError || !subscription?.stripe_customer_id) {
      logger.error("Failed to find Stripe customer ID", {
        prefix: "API/billing/invoices",
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

    try {
      // First get the total count of invoices for pagination metadata
      logger.debug("Fetching total invoice count", {
        prefix: "API/billing/invoices",
        data: { customerId },
      });

      let totalInvoices = 0;
      try {
        const invoiceCountResult = await stripe.invoices.list({
          customer: customerId,
          limit: 1,
        });

        // Stripe's API includes total_count in the response but TypeScript types may not include it
        // Try to access it safely with type assertion
        totalInvoices =
          (
            invoiceCountResult as Stripe.ApiList<Stripe.Invoice> & {
              total_count?: number;
            }
          ).total_count || 0;

        logger.debug("Total invoice count from Stripe", {
          prefix: "API/billing/invoices",
          data: { count: totalInvoices },
        });
      } catch (countError) {
        logger.warn(
          "Error getting total invoice count, will use fallback method",
          {
            prefix: "API/billing/invoices",
            data: {
              error:
                countError instanceof Error
                  ? countError.message
                  : "Unknown error",
            },
          }
        );
      }

      // Fetch invoices from Stripe with pagination
      logger.debug("Fetching invoices with pagination", {
        prefix: "API/billing/invoices",
        data: { page: validPage, limit: validLimit, customerId },
      });

      // Stripe uses cursor-based pagination, so we need to implement our own offset-based pagination
      const allInvoices: Stripe.Invoice[] = [];
      let hasMore = false;

      // For our page, we need to fetch invoices sequentially until we reach our offset
      // This is not efficient for large offsets but Stripe doesn't provide direct offset-based pagination
      const invoicesToSkip = (validPage - 1) * validLimit;
      let currentBatch = { has_more: false, data: [] as Stripe.Invoice[] };

      // If we're on page 1, we don't need to skip any
      if (invoicesToSkip === 0) {
        currentBatch = await stripe.invoices.list({
          customer: customerId,
          limit: validLimit,
        });

        logger.debug("Fetched first page invoices directly", {
          prefix: "API/billing/invoices",
          data: {
            count: currentBatch.data.length,
            hasMore: currentBatch.has_more,
          },
        });
      } else {
        // For other pages, we need to fetch batches until we reach our offset
        // This is not ideal, but Stripe API limitations require this approach
        const batchSize = Math.min(100, invoicesToSkip + validLimit); // Fetch in larger batches for efficiency
        let collected = 0;
        let startingAfter: string | undefined = undefined;

        logger.debug("Fetching invoices with pagination (non-first page)", {
          prefix: "API/billing/invoices",
          data: {
            invoicesToSkip,
            batchSize,
            validPage,
            validLimit,
          },
        });

        while (collected < invoicesToSkip + validLimit) {
          const batch: Stripe.ApiList<Stripe.Invoice> =
            await stripe.invoices.list({
              customer: customerId,
              limit: batchSize,
              starting_after: startingAfter,
            });

          logger.debug("Fetched batch of invoices", {
            prefix: "API/billing/invoices",
            data: {
              batchSize,
              batchCount: batch.data.length,
              hasMore: batch.has_more,
              collected,
            },
          });

          if (batch.data.length === 0) {
            logger.debug("No more invoices to fetch", {
              prefix: "API/billing/invoices",
            });
            break;
          }

          // If we've skipped enough, start collecting
          if (collected >= invoicesToSkip) {
            const neededFromBatch: number = validLimit - allInvoices.length;
            allInvoices.push(...batch.data.slice(0, neededFromBatch));

            logger.debug("Added invoices to result", {
              prefix: "API/billing/invoices",
              data: {
                neededFromBatch,
                addedCount: Math.min(batch.data.length, neededFromBatch),
                totalCollected: allInvoices.length,
              },
            });

            if (allInvoices.length >= validLimit) break;
          } else {
            // We still need to skip some, but might need some from this batch
            const remainingToSkip = invoicesToSkip - collected;
            if (batch.data.length > remainingToSkip) {
              const toAdd = batch.data.slice(
                remainingToSkip,
                remainingToSkip + validLimit
              );
              allInvoices.push(...toAdd);

              logger.debug("Added invoices from middle of batch", {
                prefix: "API/billing/invoices",
                data: {
                  remainingToSkip,
                  addedCount: toAdd.length,
                  totalCollected: allInvoices.length,
                },
              });

              if (allInvoices.length >= validLimit) break;
            }
          }

          collected += batch.data.length;
          hasMore = batch.has_more;

          if (!batch.has_more) {
            logger.debug("No more invoices from Stripe", {
              prefix: "API/billing/invoices",
            });
            break;
          }

          startingAfter = batch.data[batch.data.length - 1].id;
        }

        currentBatch = { has_more: hasMore, data: allInvoices };

        logger.debug("Completed pagination fetch", {
          prefix: "API/billing/invoices",
          data: {
            resultCount: currentBatch.data.length,
            hasMore: currentBatch.has_more,
          },
        });
      }

      // Transform the Stripe invoices into a simpler format for the frontend
      const formattedInvoices: InvoiceResponse[] = currentBatch.data.map(
        (invoice) => ({
          id: invoice.id,
          date: invoice.created,
          amount: invoice.amount_paid / 100, // Convert from cents to dollars
          status: invoice.status || "unknown",
          description:
            invoice.description ||
            invoice.lines.data[0]?.description ||
            "Subscription",
          pdf: invoice.invoice_pdf || null,
          invoice_url: invoice.hosted_invoice_url || null,
        })
      );

      // If totalInvoices is still 0 but we have invoices, use the batch count as a fallback
      // This ensures we at least have pagination that works with the invoices we found
      if (totalInvoices === 0 && formattedInvoices.length > 0) {
        // We know there are at least as many invoices as we've fetched
        totalInvoices = Math.max(
          (validPage - 1) * validLimit + formattedInvoices.length,
          formattedInvoices.length
        );

        if (currentBatch.has_more) {
          // If there are more, add an extra page worth to the total
          totalInvoices += validLimit;
        }

        logger.debug("Using fallback calculation for total invoices", {
          prefix: "API/billing/invoices",
          data: {
            calculatedTotal: totalInvoices,
            currentBatchSize: formattedInvoices.length,
            hasMore: currentBatch.has_more,
          },
        });
      }

      // Calculate pagination metadata
      const totalPages = Math.max(1, Math.ceil(totalInvoices / validLimit));
      const hasMorePages = validPage < totalPages;

      const paginationMeta = {
        total: totalInvoices,
        page: validPage,
        limit: validLimit,
        totalPages,
        hasMore: hasMorePages,
      };

      logger.debug("Fetched invoices successfully", {
        prefix: "API/billing/invoices",
        data: {
          profileId,
          invoiceCount: formattedInvoices.length,
          totalCount: totalInvoices,
          page: validPage,
          totalPages,
        },
      });

      return NextResponse.json({
        invoices: formattedInvoices,
        pagination: paginationMeta,
      } as PaginatedInvoicesResponse);
    } catch (stripeError) {
      logger.error("Stripe API error while fetching invoices", {
        prefix: "API/billing/invoices",
        data: {
          error:
            stripeError instanceof Error
              ? stripeError.message
              : "Unknown Stripe error",
          customerId,
        },
      });

      return NextResponse.json(
        { error: "Error from payment provider" },
        { status: 502 }
      );
    }
  } catch (error) {
    logger.error("Failed to fetch invoices", {
      prefix: "API/billing/invoices",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return NextResponse.json(
      { error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}
