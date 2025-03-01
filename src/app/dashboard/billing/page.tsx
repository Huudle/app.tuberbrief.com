"use client";

import {
  Receipt,
  CreditCard,
  FileText,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { AppLayout } from "@/components/ui/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { Badge } from "@/components/ui/badge";
import { InvoiceResponse } from "@/app/api/billing/invoices/route";
import { supabaseAnon } from "@/lib/supabase";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProfileChannels } from "@/lib/supabase";
import React, { useEffect } from "react";

interface PaginationState {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

// We need to extend the Profile type to allow for our usage metrics
// Using a type assertion approach for flexibility
interface ProfileWithUsage {
  [key: string]: any;
  subscription?: {
    plans?: {
      channel_limit?: number;
      monthly_email_limit?: number;
      plan_name?: string;
      monthly_cost?: number;
    };
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    status?: string;
    start_date?: number;
    end_date?: number;
  };
  id?: string;
}

export default function BillingPage() {
  const { profile: originalProfile, isLoading: profileLoading } = useProfile();
  // Cast the profile to our extended type
  const profile = originalProfile as unknown as ProfileWithUsage;
  const [isLoading, setIsLoading] = React.useState(true);
  const [invoices, setInvoices] = React.useState<InvoiceResponse[]>([]);
  const [invoiceError, setInvoiceError] = React.useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [showChangePlanDialog, setShowChangePlanDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationState>({
    total: 0,
    page: 1,
    limit: 5,
    totalPages: 0,
    hasMore: false,
  });
  const [actualChannelCount, setActualChannelCount] = React.useState<
    number | null
  >(null);

  useEffect(() => {
    async function loadChannelCount() {
      if (!profile?.id) return;

      try {
        // Get profile channels using the same function used in the channels page
        const channels = await getProfileChannels(profile.id);
        setActualChannelCount(channels.length);
      } catch (error) {
        console.error("Error loading channel count:", error);
        setActualChannelCount(0);
      }
    }

    loadChannelCount();
  }, [profile?.id]);

  // Format date helper function
  const formatDate = (dateString: string | number) => {
    const date =
      typeof dateString === "number"
        ? new Date(dateString * 1000) // Convert Unix timestamp to date
        : new Date(dateString);

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  // Format price helper function
  function formatPrice(amount: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  // Calculate percentage helper function
  function calculatePercentage(used: number, limit: number) {
    if (limit <= 0) return 0;
    const percentage = (used / limit) * 100;
    return Math.min(100, Math.max(0, percentage)); // Ensure between 0-100
  }

  // Get color based on usage percentage
  function getUsageColor(percentage: number) {
    if (percentage < 60) return "bg-emerald-500";
    if (percentage < 85) return "bg-amber-500";
    return "bg-rose-500";
  }

  // Safe access to usage metrics
  function getChannelCount(profile: ProfileWithUsage): number {
    // Try various possible locations for the channel count
    return (
      profile?.channel_count || // Try direct count property
      (profile?.subscription?.plans?.channel_limit
        ? getChannelUsageCount(profile.id)
        : 0) // Calculate based on channels in database
    );
  }

  // Function to safely access actual channel count
  function getChannelUsageCount(profileId?: string): number {
    if (!profileId) return 0;
    return actualChannelCount ?? 0;
  }

  function getMonthlyUsageCount(profile: ProfileWithUsage): number {
    // Try various possible locations for the monthly usage count
    return (
      profile?.monthly_usage_count ||
      profile?.metadata?.monthly_usage_count ||
      profile?.usage?.monthly ||
      0
    );
  }

  function getBillingPeriodPercentage(profile: ProfileWithUsage): number {
    if (
      !profile?.subscription?.start_date ||
      !profile?.subscription?.end_date
    ) {
      return 0;
    }

    const startDate = profile.subscription.start_date;
    const endDate = profile.subscription.end_date;
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    // Check if the dates are valid
    if (isNaN(startDate) || isNaN(endDate) || startDate >= endDate) {
      console.warn("Invalid billing period dates:", { startDate, endDate });
      return 0;
    }

    // Prevent negative progress (if current time is before start date)
    if (now < startDate) {
      return 0;
    }

    // Cap at 100% if we're past the end date
    if (now > endDate) {
      return 100;
    }

    return calculatePercentage(now - startDate, endDate - startDate);
  }

  // Function to handle page changes
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  // Function to handle page size changes
  const handlePageSizeChange = (newSize: string) => {
    setPagination((prev) => ({
      ...prev,
      limit: parseInt(newSize, 10),
      page: 1,
    }));
  };

  // Function to handle payment method management via Stripe Portal
  const handleManagePaymentMethods = async () => {
    try {
      setIsRedirecting(true);

      // Make request with proper credentials
      const response = await fetch("/api/billing/create-portal-session", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for auth
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Portal session error:", errorData);
        throw new Error(errorData.error || "Failed to open payment portal");
      }

      const data = await response.json();

      if (!data.url) {
        console.error("No portal URL returned:", data);
        throw new Error("Invalid response from payment portal");
      }

      // Open in the same window
      window.location.href = data.url;
    } catch (error) {
      console.error("Error opening Stripe portal:", error);
      alert(
        "Unable to open payment portal: " +
          (error instanceof Error ? error.message : "Please try again later")
      );
      setIsRedirecting(false);
    }
  };

  // Function to handle plan changes via Stripe Portal
  const handleChangePlan = async () => {
    try {
      setIsRedirecting(true);
      setShowChangePlanDialog(false);

      // Make request with proper credentials and plan change parameter
      const response = await fetch(
        "/api/billing/create-portal-session?plan=change",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // Include cookies for auth
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Portal session error:", errorData);
        throw new Error(
          errorData.error || "Failed to open plan selection portal"
        );
      }

      const data = await response.json();

      if (!data.url) {
        console.error("No portal URL returned:", data);
        throw new Error("Invalid response from plan selection portal");
      }

      // Open in the same window
      window.location.href = data.url;
    } catch (error) {
      console.error("Error opening Stripe plan selection portal:", error);
      alert(
        "Unable to open plan selection portal: " +
          (error instanceof Error ? error.message : "Please try again later")
      );
      setIsRedirecting(false);
    }
  };

  // Function to handle subscription cancellation via Stripe Portal
  const handleCancelSubscription = async () => {
    try {
      setIsRedirecting(true);
      setShowCancelDialog(false);

      // Make request with proper credentials and cancellation parameter
      const response = await fetch(
        "/api/billing/create-portal-session?action=cancel",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // Include cookies for auth
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Portal session error:", errorData);
        throw new Error(
          errorData.error || "Failed to open cancellation portal"
        );
      }

      const data = await response.json();

      if (!data.url) {
        console.error("No portal URL returned:", data);
        throw new Error("Invalid response from cancellation portal");
      }

      // Open in the same window
      window.location.href = data.url;
    } catch (error) {
      console.error("Error opening Stripe cancellation portal:", error);
      alert(
        "Unable to open cancellation portal: " +
          (error instanceof Error ? error.message : "Please try again later")
      );
      setIsRedirecting(false);
    }
  };

  // Fetch invoices data when profile is loaded or pagination changes
  React.useEffect(() => {
    // Debug billing period dates if they exist
    if (profile?.subscription?.start_date || profile?.subscription?.end_date) {
      console.log("Subscription dates for billing period calculation:", {
        start_date: profile.subscription.start_date,
        end_date: profile.subscription.end_date,
        start_date_type: typeof profile.subscription.start_date,
        end_date_type: typeof profile.subscription.end_date,
        formatted_start: profile.subscription.start_date
          ? formatDate(profile.subscription.start_date)
          : "Invalid",
        formatted_end: profile.subscription.end_date
          ? formatDate(profile.subscription.end_date)
          : "Invalid",
      });
    }

    if (!profile) return;

    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    async function fetchInvoices() {
      try {
        setIsLoading(true);
        console.log("Fetching invoices with pagination:", pagination);

        // Make sure we have the latest session
        const { data: sessionData, error: sessionError } =
          await supabaseAnon.auth.getSession();
        if (sessionError) {
          console.error("Session error:", sessionError);

          // If we get a session error, try to refresh the token
          if (retryCount < MAX_RETRIES) {
            const { error: refreshError } =
              await supabaseAnon.auth.refreshSession();
            if (refreshError) {
              throw new Error(
                "Unable to refresh authentication. Please log in again."
              );
            }
            retryCount++;
            if (isMounted) {
              // Wait a bit before retrying
              setTimeout(fetchInvoices, 1000);
            }
            return;
          }

          throw new Error(
            "Authentication required. Please refresh and try again."
          );
        }

        if (!sessionData.session) {
          throw new Error("No active session found. Please log in again.");
        }

        // Get the access token to use for the API request
        const accessToken = sessionData.session.access_token;
        console.log("Access token available:", !!accessToken);

        // Log the customer ID for debugging purposes
        console.log(
          "Customer ID:",
          profile?.subscription?.stripe_customer_id || "None"
        );

        // Make the API request with the authorization header and pagination params
        const apiUrl = `/api/billing/invoices?page=${pagination.page}&limit=${pagination.limit}`;
        console.log("Fetching from API URL:", apiUrl);

        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        console.log("API Response status:", response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Invoice API error:", errorData);

          // If we get a 401 error, try to refresh the token and retry
          if (response.status === 401 && retryCount < MAX_RETRIES) {
            const { error: refreshError } =
              await supabaseAnon.auth.refreshSession();
            if (refreshError) {
              throw new Error("Session expired. Please log in again.");
            }
            retryCount++;
            if (isMounted) {
              // Wait a bit before retrying
              setTimeout(fetchInvoices, 1000);
            }
            return;
          }

          throw new Error(errorData.error || "Failed to fetch invoices");
        }

        const responseData = await response.json();
        console.log("Full invoice API response:", responseData);

        if (isMounted) {
          if (responseData.invoices && responseData.invoices.length > 0) {
            setInvoices(responseData.invoices);
            console.log("Invoices set:", responseData.invoices.length);
          } else {
            console.log("No invoices found in response");
            setInvoices([]);
          }

          if (responseData.pagination) {
            // Ensure pagination values are valid before setting state
            const sanitizedPagination = {
              total: Math.max(0, responseData.pagination.total || 0),
              page: Math.max(1, responseData.pagination.page || 1),
              limit: Math.max(1, responseData.pagination.limit || 10),
              totalPages: Math.max(1, responseData.pagination.totalPages || 1),
              hasMore: !!responseData.pagination.hasMore,
            };

            console.log("Pagination from API:", responseData.pagination);
            console.log("Sanitized pagination:", sanitizedPagination);

            setPagination(sanitizedPagination);
          } else {
            console.log("No pagination data received, using fallback");
            // If no pagination data but we have invoices, create reasonable pagination data
            if (responseData.invoices && responseData.invoices.length > 0) {
              const fallbackPagination = {
                total: responseData.invoices.length,
                page: 1,
                limit: pagination.limit,
                totalPages: 1,
                hasMore: false,
              };
              console.log("Using fallback pagination:", fallbackPagination);
              setPagination(fallbackPagination);
            } else {
              console.log("Resetting pagination to defaults");
              setPagination({
                total: 0,
                page: 1,
                limit: pagination.limit,
                totalPages: 1,
                hasMore: false,
              });
            }
          }

          setInvoiceError(null);
        }
      } catch (error) {
        console.error("Error fetching invoices:", error);
        if (isMounted) {
          setInvoiceError(
            error instanceof Error ? error.message : "Failed to load invoices"
          );
          setInvoices([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchInvoices();

    return () => {
      isMounted = false;
    };
  }, [profile, pagination.page, pagination.limit]);

  if (isLoading || profileLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Billing", active: true }]}>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Billing</h1>

          <Skeleton className="h-[200px] w-full" />

          <div className="space-y-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout breadcrumbs={[{ label: "Billing", active: true }]}>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">Billing</h1>
          <Card>
            <CardHeader>
              <CardTitle>Authentication Required</CardTitle>
              <CardDescription>
                Please sign in to view your billing information.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Generate pagination numbers (show 5 page numbers max)
  const generatePaginationItems = () => {
    const { page, totalPages } = pagination;
    const items = [];

    // Handle case where there are no pages or just one page
    if (totalPages <= 0) {
      console.log("No pages to generate pagination items for");
      return [];
    }

    // Handle single page case
    if (totalPages === 1) {
      console.log("Only one page, showing simplified pagination");
      return [
        <PaginationItem key="page-1">
          <PaginationLink isActive={true} onClick={() => handlePageChange(1)}>
            1
          </PaginationLink>
        </PaginationItem>,
      ];
    }

    // Always show first page
    items.push(
      <PaginationItem key="page-1">
        <PaginationLink
          isActive={page === 1}
          onClick={() => handlePageChange(1)}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    // Calculate range of pages to show
    let startPage = Math.max(2, page - 1);
    let endPage = Math.min(totalPages - 1, page + 1);

    // Adjust if we're near the start
    if (page <= 3) {
      endPage = Math.min(totalPages - 1, 4);
    }

    // Adjust if we're near the end
    if (page >= totalPages - 2) {
      startPage = Math.max(2, totalPages - 3);
    }

    // Show ellipsis after first page if needed
    if (startPage > 2) {
      items.push(
        <PaginationItem key="ellipsis-1">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // Add middle pages
    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={`page-${i}`}>
          <PaginationLink
            isActive={page === i}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    // Show ellipsis before last page if needed
    if (endPage < totalPages - 1 && totalPages > 1) {
      items.push(
        <PaginationItem key="ellipsis-2">
          <PaginationEllipsis />
        </PaginationItem>
      );
    }

    // Always show last page if there is more than one page
    if (totalPages > 1) {
      items.push(
        <PaginationItem key={`page-${totalPages}`}>
          <PaginationLink
            isActive={page === totalPages}
            onClick={() => handlePageChange(totalPages)}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    console.log(
      `Generated ${items.length} pagination items for ${totalPages} pages`
    );
    return items;
  };

  // Main content
  return (
    <AppLayout breadcrumbs={[{ label: "Billing", active: true }]}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Billing</h1>

        {/* Subscription and Usage Statistics Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Subscription Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="mr-2 h-5 w-5" />
                Current Subscription
              </CardTitle>
              <CardDescription>
                Overview of your current plan and subscription details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6">
                <div>
                  <h3 className="text-lg font-medium">Plan Details</h3>
                  <div className="mt-4 overflow-hidden rounded-md border">
                    <table className="w-full">
                      <tbody className="divide-y">
                        <tr className="bg-muted/20">
                          <td className="p-3 text-sm text-muted-foreground">
                            Current Plan
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            <div className="flex items-center justify-end">
                              <span>
                                {profile.subscription?.plans?.plan_name ||
                                  "Free"}
                              </span>
                              {profile.subscription?.plans?.plan_name !==
                                "Free" && (
                                <Badge className="ml-2" variant="outline">
                                  Active
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 text-sm text-muted-foreground">
                            Billing Period
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            Monthly
                          </td>
                        </tr>
                        <tr className="bg-muted/20">
                          <td className="p-3 text-sm text-muted-foreground">
                            Monthly Cost
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            {formatPrice(
                              profile.subscription?.plans?.monthly_cost || 0
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 text-sm text-muted-foreground">
                            Next Billing Date
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            <div className="flex items-center justify-end">
                              <Calendar className="mr-1 h-4 w-4" />
                              <span>
                                {profile.subscription?.end_date
                                  ? formatDate(profile.subscription.end_date)
                                  : "N/A"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium">Plan Features</h3>
                  <div className="mt-4 overflow-hidden rounded-md border">
                    <table className="w-full">
                      <tbody className="divide-y">
                        <tr className="bg-muted/20">
                          <td className="p-3 text-sm text-muted-foreground">
                            Channel Limit
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            {profile.subscription?.plans?.channel_limit || 1}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 text-sm text-muted-foreground">
                            Monthly Usage Limit
                          </td>
                          <td className="p-3 text-sm font-medium text-right">
                            {profile.subscription?.plans?.monthly_email_limit ||
                              5}{" "}
                            requests
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <div className="flex justify-between w-full gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowChangePlanDialog(true)}
                  disabled={isRedirecting}
                >
                  {isRedirecting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                      Processing...
                    </span>
                  ) : (
                    "Change Plan"
                  )}
                </Button>

                {profile.subscription?.stripe_subscription_id && (
                  <Button
                    variant="outline"
                    onClick={handleManagePaymentMethods}
                    disabled={isRedirecting}
                  >
                    {isRedirecting &&
                    !window.location.href.includes("plan=change") &&
                    !window.location.href.includes("action=cancel")
                      ? "Redirecting..."
                      : "Manage Payment Methods"}
                  </Button>
                )}

                {profile.subscription?.stripe_subscription_id &&
                  profile.subscription?.status === "active" &&
                  profile.subscription?.plans?.plan_name?.toLowerCase() !==
                    "free" && (
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelDialog(true)}
                      disabled={isRedirecting}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      {isRedirecting ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                          Processing...
                        </span>
                      ) : (
                        "Cancel Plan"
                      )}
                    </Button>
                  )}
              </div>

              <p className="text-xs text-muted-foreground">
                For your security, payment information is securely stored by our
                payment processor and not in our database.
              </p>
            </CardFooter>
          </Card>

          {/* Usage Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Receipt className="mr-2 h-5 w-5" />
                Usage Statistics
              </CardTitle>
              <CardDescription>
                Current usage metrics for this billing period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Channels Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Channels Used</span>
                    <span className="text-sm text-muted-foreground">
                      {actualChannelCount !== null
                        ? actualChannelCount
                        : getChannelCount(profile)}{" "}
                      of {profile.subscription?.plans?.channel_limit || 1}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress
                      value={calculatePercentage(
                        actualChannelCount !== null
                          ? actualChannelCount
                          : getChannelCount(profile),
                        profile.subscription?.plans?.channel_limit || 1
                      )}
                      className="h-2"
                      indicatorClassName={getUsageColor(
                        calculatePercentage(
                          actualChannelCount !== null
                            ? actualChannelCount
                            : getChannelCount(profile),
                          profile.subscription?.plans?.channel_limit || 1
                        )
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {calculatePercentage(
                      actualChannelCount !== null
                        ? actualChannelCount
                        : getChannelCount(profile),
                      profile.subscription?.plans?.channel_limit || 1
                    ) >= 90
                      ? "You're approaching your channel limit. Consider upgrading your plan for more channels."
                      : "You have capacity to add more channels within your current plan."}
                  </p>
                </div>

                {/* Monthly Requests Usage */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Monthly Requests
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {getMonthlyUsageCount(profile)} of{" "}
                      {profile.subscription?.plans?.monthly_email_limit || 5}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress
                      value={calculatePercentage(
                        getMonthlyUsageCount(profile),
                        profile.subscription?.plans?.monthly_email_limit || 5
                      )}
                      className="h-2"
                      indicatorClassName={getUsageColor(
                        calculatePercentage(
                          getMonthlyUsageCount(profile),
                          profile.subscription?.plans?.monthly_email_limit || 5
                        )
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {calculatePercentage(
                      getMonthlyUsageCount(profile),
                      profile.subscription?.plans?.monthly_email_limit || 5
                    ) >= 80
                      ? "You're approaching your monthly request limit. Upgrade for more capacity."
                      : "You have remaining request capacity for this billing period."}
                  </p>
                </div>

                {/* Period Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Billing Period Progress
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {profile.subscription?.start_date &&
                      profile.subscription?.end_date
                        ? `${
                            Math.floor(getBillingPeriodPercentage(profile)) || 0
                          }%`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="relative">
                    {profile.subscription?.start_date &&
                    profile.subscription?.end_date ? (
                      <Progress
                        value={getBillingPeriodPercentage(profile)}
                        className="h-2"
                      />
                    ) : (
                      <div className="h-2 w-full bg-muted rounded-full"></div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {profile.subscription?.end_date
                      ? `Your current billing period ends on ${formatDate(
                          profile.subscription.end_date
                        )}`
                      : "No active billing period found."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Billing History Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Billing History
          </h2>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Invoices</CardTitle>
                <CardDescription>
                  View and download your past invoices
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                {/* Force Refresh button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log("Force refreshing invoice data");
                    setIsLoading(true);
                    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to page 1 and trigger a re-fetch
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? "Refreshing..." : "Refresh Data"}
                </Button>

                {/* Page size selector */}
                {pagination.total > 0 && (
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground mr-2">
                      Show:
                    </span>
                    <Select
                      value={pagination.limit.toString()}
                      onValueChange={handlePageSizeChange}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue placeholder="5" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {invoiceError ? (
                <div className="py-8 text-center">
                  <p className="text-destructive">{invoiceError}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {profile?.subscription?.stripe_customer_id
                      ? "There was an error loading your invoices. Please try again later."
                      : "You don't have any active subscriptions yet."}
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => {
                      setIsLoading(true);
                      setInvoiceError(null);
                      setPagination((prev) => ({ ...prev })); // Trigger a re-fetch
                    }}
                  >
                    Retry
                  </Button>
                </div>
              ) : isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : invoices.length > 0 ? (
                <div className="space-y-4">
                  <div className="rounded-md border">
                    <div className="grid grid-cols-4 bg-muted/50 p-3 text-sm font-medium">
                      <div>Date</div>
                      <div>Amount</div>
                      <div>Status</div>
                      <div className="text-right">Actions</div>
                    </div>
                    {invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="grid grid-cols-4 items-center p-3 text-sm border-t"
                      >
                        <div>{formatDate(invoice.date)}</div>
                        <div>{formatPrice(invoice.amount)}</div>
                        <div>
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "default"
                                : "destructive"
                            }
                          >
                            {invoice.status === "paid" ? "Paid" : "Unpaid"}
                          </Badge>
                        </div>
                        <div className="text-right">
                          {invoice.invoice_url ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={invoice.invoice_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View
                              </a>
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled>
                              <FileText className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination UI */}
                  {pagination.totalPages > 1 && (
                    <Pagination className="mt-4">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() =>
                              handlePageChange(pagination.page - 1)
                            }
                            aria-disabled={pagination.page === 1}
                            className={
                              pagination.page === 1
                                ? "pointer-events-none opacity-50"
                                : ""
                            }
                          />
                        </PaginationItem>

                        {generatePaginationItems()}

                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              handlePageChange(pagination.page + 1)
                            }
                            aria-disabled={
                              pagination.page === pagination.totalPages
                            }
                            className={
                              pagination.page === pagination.totalPages
                                ? "pointer-events-none opacity-50"
                                : ""
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}

                  {/* Pagination info */}
                  {pagination.total > 0 && (
                    <div className="text-sm text-muted-foreground text-center">
                      Showing{" "}
                      <span className="font-medium">
                        {(pagination.page - 1) * pagination.limit + 1}
                      </span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {Math.min(
                          pagination.page * pagination.limit,
                          pagination.total
                        )}
                      </span>{" "}
                      of <span className="font-medium">{pagination.total}</span>{" "}
                      invoices
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Receipt className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="mt-4 text-muted-foreground">
                    {profile?.subscription?.stripe_customer_id
                      ? "No invoices found for your account yet."
                      : "You don't have an active subscription yet."}
                  </p>
                  {profile?.subscription?.stripe_customer_id && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Invoices will appear here after your first payment is
                      processed.
                    </p>
                  )}
                  {profile?.subscription?.stripe_customer_id && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setIsLoading(true);
                        setPagination((prev) => ({ ...prev })); // Trigger a re-fetch
                      }}
                    >
                      Refresh
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Plan Change Dialog */}
        <Dialog
          open={showChangePlanDialog}
          onOpenChange={setShowChangePlanDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Subscription Plan</DialogTitle>
              <DialogDescription>
                You&apos;ll be redirected to the Stripe Customer Portal to
                select a new plan. Your billing information will be updated
                automatically.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowChangePlanDialog(false)}
                disabled={isRedirecting}
              >
                Cancel
              </Button>
              <Button onClick={handleChangePlan} disabled={isRedirecting}>
                {isRedirecting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    Processing...
                  </span>
                ) : (
                  "Continue to Stripe"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancellation Dialog */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Cancel Subscription
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel your subscription? You&apos;ll
                still have access until the end of your current billing period
                on{" "}
                {profile.subscription?.end_date
                  ? new Date(profile.subscription.end_date).toLocaleDateString()
                  : "your next billing date"}
                .
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(false)}
                disabled={isRedirecting}
              >
                Keep Subscription
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSubscription}
                disabled={isRedirecting}
              >
                {isRedirecting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                    Processing...
                  </span>
                ) : (
                  "Confirm Cancellation"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
