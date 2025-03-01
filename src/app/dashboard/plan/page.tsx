"use client";

import * as React from "react";
import { Check, Clock } from "lucide-react";
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
import { Plan } from "@/lib/types";

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function PlanPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingPlan, setPendingPlan] = React.useState<Plan | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const { toast } = useToast();

  const breadcrumbs = [{ label: "Plans", active: true }];

  // Fetch plans from the database
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

  // Function to redirect to Stripe portal for plan changes
  const redirectToStripePortal = async (selectedPlan?: Plan | null) => {
    try {
      setIsProcessing(true);

      // Build the URL with the selected plan if provided
      let portalUrl = "/api/billing/create-portal-session?plan=change";
      if (selectedPlan && selectedPlan.stripe_price_id) {
        portalUrl += `&priceId=${selectedPlan.stripe_price_id}`;
      }

      // Make request with proper credentials and plan change parameter
      const response = await fetch(portalUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for auth
      });

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
      toast({
        title: "Error",
        description: "Failed to open plan selection portal. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
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
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Plans</h1>
            {isProcessing && (
              <div className="flex items-center gap-2 text-primary">
                <span className="h-5 w-5 inline-block border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                <span>Processing...</span>
              </div>
            )}
          </div>

          {/* Instructions card - Clearer instructions */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="pt-6">
              <div className="flex gap-2 items-center">
                <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Click on a plan card to view plan details and be redirected
                    to Stripe&apos;s secure payment portal, where you can
                    complete your subscription change. Your current plan remains
                    active until you finalize the change in Stripe.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative transition-all hover:shadow-md flex flex-col",
                  profile?.subscription?.plans.plan_name.toLowerCase() ===
                    plan.plan_name.toLowerCase() || pendingPlan?.id === plan.id
                    ? "border-primary shadow-sm opacity-100"
                    : "cursor-pointer hover:border-primary/50 hover:scale-[1.01] transition-transform",
                  isProcessing && "pointer-events-none opacity-70"
                )}
                onClick={() => {
                  // Prevent additional clicks while processing
                  if (isProcessing) return;

                  // If this isn't the current plan, open confirmation dialog
                  if (
                    profile?.subscription?.plans.plan_name.toLowerCase() !==
                    plan.plan_name.toLowerCase()
                  ) {
                    // Show the confirmation dialog
                    setPendingPlan(plan);
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {plan.features.plan.name}
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
                <CardContent className="pb-16">
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

                {/* Best Value Badge for Pro Plan */}
                {plan.plan_name.toLowerCase() === "pro" && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-sm">
                    Best Value
                  </div>
                )}

                {profile?.subscription?.plans.plan_name.toLowerCase() ===
                  plan.plan_name.toLowerCase() && (
                  <div className="absolute right-4 top-4">
                    <div className="flex items-center gap-1">
                      <Check className="h-5 w-5 text-primary" />
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        Current Plan
                      </span>
                    </div>
                  </div>
                )}

                {/* Show pending badge when selecting a new plan */}
                {pendingPlan?.id === plan.id && (
                  <div className="absolute right-4 top-4">
                    <Clock className="h-6 w-6 text-amber-500" />
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                      Pending
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={pendingPlan !== null}
        onOpenChange={(open) => !open && setPendingPlan(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Plan Change</DialogTitle>
            <DialogDescription>
              {pendingPlan && (
                <>
                  You&apos;re about to switch to the{" "}
                  <strong>{pendingPlan.features.plan.name}</strong> plan (
                  {formatPrice(pendingPlan.monthly_cost)}
                  {pendingPlan.monthly_cost > 0 ? "/month" : ""}).
                </>
              )}
            </DialogDescription>
            {pendingPlan && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Plan features:</h4>
                <ul className="text-sm space-y-1 list-disc pl-4">
                  <li>
                    {pendingPlan.monthly_email_limit} notifications per month
                  </li>
                  <li>Monitor up to {pendingPlan.channel_limit} channels</li>
                </ul>

                <div className="mt-4">
                  <h4 className="text-sm font-medium">
                    How plan changes work:
                  </h4>
                  <ol className="text-sm mt-2 list-decimal pl-4 space-y-1">
                    <li>Click &quot;Continue to Stripe&quot; below</li>
                    <li>
                      In Stripe&apos;s secure portal, review and confirm the
                      plan change
                    </li>
                    <li>
                      Your subscription will be updated immediately after
                      completing the process in Stripe
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingPlan(null)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => redirectToStripePortal(pendingPlan)}
              disabled={isProcessing}
              className="w-full sm:w-auto"
            >
              {isProcessing ? (
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
    </AppLayout>
  );
}
