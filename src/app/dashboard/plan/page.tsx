"use client";

import * as React from "react";
import { Check, Clock, CalendarIcon } from "lucide-react";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/ui/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabaseAnon } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { loadStripe } from "@stripe/stripe-js";
import { Plan } from "@/lib/types";

// Interface for pending plan information
interface PendingPlanInfo {
  id?: string;
  profile_id: string;
  next_plan_id: string;
  stripe_price_id: string | null;
  start_date: string;
  plans: {
    plan_name: string;
    monthly_email_limit: number;
    channel_limit: number;
  };
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

export default function PlanPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingPlan, setPendingPlan] = React.useState<Plan | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [pendingPlanInfo, setPendingPlanInfo] =
    React.useState<PendingPlanInfo | null>(null);
  const { toast } = useToast();

  const breadcrumbs = [{ label: "Plans", active: true }];

  // Format date helper function
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };

  // Fetch pending plan information if there's a subscription
  React.useEffect(() => {
    async function fetchPendingPlan() {
      if (!profile?.id) return;

      try {
        const { data, error } = await supabaseAnon
          .from("pending_plans")
          .select(
            `
            *,
            plans:next_plan_id (
              plan_name,
              monthly_email_limit,
              channel_limit
            )
          `
          )
          .eq("profile_id", profile.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setPendingPlanInfo(data);
        }
      } catch (error) {
        console.error("Error fetching pending plan:", error);
      }
    }

    fetchPendingPlan();
  }, [profile?.id]);

  React.useEffect(() => {
    async function fetchPlans() {
      try {
        const { data, error } = await supabaseAnon
          .from("plans")
          .select("*")
          .order("monthly_cost", { ascending: true });

        if (error) throw error;
        setPlans(data);
      } catch (error) {
        console.error("Error fetching plans:", error);
        toast({
          title: "Error",
          description: "Failed to load plans. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchPlans();
  }, [toast]);

  const handleUpdatePlan = async (newPlanId: string) => {
    try {
      setIsProcessing(true);
      const selectedPlan = plans.find((plan) => plan.id === newPlanId);
      if (!selectedPlan) return;

      const currentPlan = profile?.subscription?.plans;

      // Check if this is the free plan
      if (selectedPlan.plan_name === "Free") {
        // Call the cancellation endpoint instead
        const response = await fetch("/api/subscription/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: profile?.id,
            targetPlanId: selectedPlan.id,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to cancel subscription");
        }

        // Refresh the profile to show updated plan
        // You may need to add a method to refresh profile data
        toast({
          title: "Plan Updated",
          description: "You have been switched to the Free plan",
          variant: "default",
        });

        // Reload the page to reflect changes
        window.location.reload();
        return;
      }
      // Check if this is a downgrade to a lower-tier paid plan
      else if (
        currentPlan &&
        currentPlan.monthly_cost > selectedPlan.monthly_cost &&
        selectedPlan.monthly_cost > 0 &&
        profile?.subscription?.stripe_subscription_id
      ) {
        // This is a downgrade to a lower paid plan - use delayed switch
        const response = await fetch("/api/subscription/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: profile?.id,
            currentSubId: profile.subscription.stripe_subscription_id,
            newPlanId: selectedPlan.id,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to schedule plan switch");
        }

        toast({
          title: "Plan Change Scheduled",
          description: `You will be switched to the ${
            selectedPlan.plan_name
          } plan at the end of your current billing period (${new Date(
            result.endDate
          ).toLocaleDateString()})`,
          variant: "default",
        });

        // Reload to show pending change
        window.location.reload();
        return;
      } else {
        // For paid plan upgrades, continue with checkout process
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: selectedPlan.stripe_price_id,
            profile: profile,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to create checkout session");
        }

        const stripe = await stripePromise;
        await stripe?.redirectToCheckout({ sessionId: result.sessionId });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update plan. Please try again.",
        variant: "destructive",
      });
      logger.error("Error updating plan", {
        prefix: "PlanPage",
        data: { error, profileId: profile?.id, newPlanId },
      });
    } finally {
      setIsProcessing(false);
      setPendingPlan(null);
    }
  };

  if (isLoading || profileLoading) {
    return (
      <AppLayout breadcrumbs={breadcrumbs}>
        <div className="container py-8">
          <Skeleton className="h-48" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <div className="container py-8">
        <div className="w-full max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Plans</h1>
          </div>

          {/* Subscription Status Information */}
          {profile?.subscription && (
            <Card className="bg-muted/40">
              <CardContent className="pt-6">
                <div className="flex flex-col space-y-2">
                  <h3 className="font-medium flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Subscription Status
                  </h3>

                  <div className="text-sm">
                    {profile.subscription.plans.plan_name === "Free" ? (
                      <p>You are currently on the Free plan.</p>
                    ) : (
                      <>
                        <p>
                          Your{" "}
                          <span className="font-semibold">
                            {profile.subscription.plans.plan_name}
                          </span>{" "}
                          plan is{" "}
                          <span className="font-medium">
                            {profile.subscription.status.toLowerCase()}
                          </span>
                          .
                        </p>

                        {profile.subscription.start_date && (
                          <p className="mt-1">
                            Started on{" "}
                            <span className="font-medium">
                              {formatDate(profile.subscription.start_date)}
                            </span>
                          </p>
                        )}

                        {profile.subscription.end_date && (
                          <p className="mt-1">
                            {profile.subscription.status === "canceled" ? (
                              <>
                                Your subscription will end on{" "}
                                <span className="font-medium text-amber-600">
                                  {formatDate(profile.subscription.end_date)}
                                </span>
                              </>
                            ) : (
                              <>
                                Next billing date:{" "}
                                <span className="font-medium">
                                  {formatDate(profile.subscription.end_date)}
                                </span>
                              </>
                            )}
                          </p>
                        )}
                      </>
                    )}

                    {/* Display pending plan change if applicable */}
                    {pendingPlanInfo && (
                      <div className="mt-3 p-2 border border-amber-200 bg-amber-50 rounded-md">
                        <p className="text-amber-700 flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span className="font-medium">
                            Plan Change Scheduled:
                          </span>{" "}
                          Switching to{" "}
                          <span className="font-medium">
                            {pendingPlanInfo.plans.plan_name}
                          </span>{" "}
                          on{" "}
                          <span className="font-medium">
                            {formatDate(pendingPlanInfo.start_date)}
                          </span>
                        </p>
                        {pendingPlanInfo.plans.plan_name === "Free" ? (
                          <p className="mt-1 text-xs text-amber-600 pl-5">
                            You&apos;ll have access to your current plan until
                            the end of the billing period.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-amber-600 pl-5">
                            Your new plan will be active starting on this date.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Display usage information */}
                  <div className="mt-3 pt-2 border-t text-sm">
                    <p>
                      <span className="font-medium">
                        {profile.subscription.usage_count || 0}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium">
                        {profile.subscription.plans.monthly_email_limit}
                      </span>{" "}
                      notifications used this month
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show different heading text based on pending plan status */}
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {pendingPlanInfo ? (
                <span className="text-amber-700 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  You have a scheduled plan change. Other plans are unavailable
                  at this time.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Choose the plan that best fits your needs
                </span>
              )}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative transition-all hover:shadow-md",
                  pendingPlanInfo
                    ? pendingPlanInfo.plans.plan_name.toLowerCase() ===
                      plan.plan_name.toLowerCase()
                      ? "border-amber-400 shadow-sm opacity-100"
                      : "opacity-50 cursor-not-allowed"
                    : (profile?.subscription?.plans.plan_name.toLowerCase() ===
                        plan.plan_name.toLowerCase() ||
                        pendingPlan?.id === plan.id) &&
                        "border-primary shadow-sm opacity-100"
                )}
                onClick={() => {
                  // Disable clicks if there's a pending plan change
                  if (pendingPlanInfo) {
                    if (
                      pendingPlanInfo.plans.plan_name.toLowerCase() !==
                      plan.plan_name.toLowerCase()
                    ) {
                      toast({
                        title: "Plan change already scheduled",
                        description: `You already have a scheduled change to the ${pendingPlanInfo.plans.plan_name} plan. Please wait for this change to complete or contact support to modify it.`,
                        variant: "default",
                      });
                    }
                    return;
                  }

                  if (
                    profile?.subscription?.plans.plan_name.toLowerCase() !==
                    plan.plan_name.toLowerCase()
                  ) {
                    setPendingPlan(plan);
                  }
                }}
              >
                {profile?.subscription?.plans.plan_name.toLowerCase() ===
                  plan.plan_name.toLowerCase() &&
                  !pendingPlanInfo && (
                    <div className="absolute right-4 top-4">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                  )}
                {/* Show pending badge for the plan that's scheduled */}
                {pendingPlanInfo &&
                  pendingPlanInfo.plans.plan_name.toLowerCase() ===
                    plan.plan_name.toLowerCase() && (
                    <div className="absolute right-4 top-4">
                      <Clock className="h-6 w-6 text-amber-500" />
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                        Scheduled
                      </span>
                    </div>
                  )}
                {/* Show pending badge when selecting a new plan */}
                {pendingPlan?.id === plan.id && !pendingPlanInfo && (
                  <div className="absolute right-4 top-4">
                    <Clock className="h-6 w-6 text-amber-500" />
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                      Pending
                    </span>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {plan.features.plan.name}
                      {profile?.subscription?.plans.plan_name.toLowerCase() ===
                        plan.plan_name.toLowerCase() && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                          Current plan
                        </span>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription className="flex flex-col gap-1">
                    <span>{plan.features.plan.description}</span>
                    <span className="inline-flex items-baseline">
                      <span className="text-2xl font-bold text-foreground">
                        {formatPrice(plan.monthly_cost)}
                      </span>
                      {plan.monthly_cost > 0 && (
                        <span className="text-muted-foreground ml-1">
                          /month
                        </span>
                      )}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-2xl font-bold">
                      {plan.monthly_email_limit} notifications
                      <span className="text-base font-normal text-muted-foreground">
                        /mo
                      </span>
                    </div>
                    <ul className="space-y-2.5 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>Monitor up to {plan.channel_limit} channels</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{plan.features.ai_summary.description}</span>
                      </li>
                      {plan.features.transcription.enabled && (
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          <span>{plan.features.transcription.description}</span>
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <Check
                          className={cn(
                            "h-4 w-4 flex-shrink-0",
                            plan.features.notifications.type === "instant"
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <span>{plan.features.notifications.description}</span>
                      </li>
                      {plan.features.webhooks.enabled && (
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          <span>{plan.features.webhooks.description}</span>
                        </li>
                      )}
                      {plan.features.priority_support.enabled && (
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          <span>
                            {plan.features.priority_support.description}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={!!pendingPlan}
        onOpenChange={(open) => !open && setPendingPlan(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              {pendingPlan && (
                <>
                  Are you sure you want to switch to the{" "}
                  {pendingPlan.features.plan.name} plan?
                  {pendingPlan.monthly_cost > 0 && (
                    <>
                      {" "}
                      You will be charged{" "}
                      {formatPrice(pendingPlan.monthly_cost)}/month.
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingPlan(null)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => pendingPlan && handleUpdatePlan(pendingPlan.id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  Processing...
                </span>
              ) : (
                "Confirm Change"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
