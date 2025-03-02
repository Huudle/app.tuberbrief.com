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
import { useProfile } from "@/hooks/use-profile";
import { Badge } from "@/components/ui/badge";
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

// We need to extend the Profile type to allow for our usage metrics
// Using a more specific approach rather than index signature with 'any'
interface ProfileWithUsage {
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
  monthly_usage_count?: number;
  metadata?: {
    monthly_usage_count?: number;
  };
  usage?: {
    monthly?: number;
  };
  channel_count?: number;
}

export default function BillingPage() {
  const { profile: originalProfile, isLoading: profileLoading } = useProfile();
  // Cast the profile to our extended type
  const profile = originalProfile as unknown as ProfileWithUsage;
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const [showChangePlanDialog, setShowChangePlanDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
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

  // Log billing period dates for debugging
  React.useEffect(() => {
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
  }, [profile]);

  if (profileLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Billing", active: true }]}>
        <div className="h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
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
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                <a
                  href="/dashboard/billing/invoices"
                  className="text-primary hover:underline flex items-center"
                >
                  <FileText className="mr-1 h-4 w-4" />
                  View all invoices
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent></CardContent>
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
                  ? new Date(
                      profile.subscription.end_date * 1000
                    ).toLocaleDateString()
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
