"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { logger } from "@/lib/logger";
import { AppLayout } from "@/components/ui/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabaseAnon } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { loadStripe } from "@stripe/stripe-js";
import {
  PaymentElement,
  useStripe,
  useElements,
  Elements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Plan } from "@/lib/types";
import { StripeError } from "@stripe/stripe-js";

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

interface PaymentSetupFormProps {
  clientSecret: string;
  onSuccess: () => void;
}

function PaymentSetupForm({ clientSecret, onSuccess }: PaymentSetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      // First validate and submit the payment element
      const { error: elementError } = await elements.submit();
      if (elementError) {
        throw elementError;
      }

      // Then confirm the setup with Stripe
      const { error } = await stripe.confirmSetup({
        elements,
        clientSecret,
        redirect: "if_required",
      });

      if (error) {
        throw error;
      }

      onSuccess();
    } catch (err) {
      const error = err as StripeError;
      toast({
        title: "Payment Setup Failed",
        description: error.message || "Please check your payment details",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Set Up Payment Method</h2>
        <p className="text-sm text-muted-foreground">
          Please provide your payment details to continue
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PaymentElement />
        <Button
          type="submit"
          className="w-full"
          disabled={isProcessing || !stripe || !elements}
        >
          {isProcessing ? "Processing..." : "Set up payment method"}
        </Button>
      </form>
    </div>
  );
}

export default function PlanPage() {
  const { profile, isLoading: profileLoading } = useProfile();
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const [paymentIntent, setPaymentIntent] = React.useState<{
    clientSecret: string;
    subscriptionId: string;
  } | null>(null);

  const breadcrumbs = [{ label: "Plans", active: true }];

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
      const selectedPlan = plans.find((plan) => plan.id === newPlanId);
      if (!selectedPlan) return;

      const response = await fetch("/api/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: profile!.id,
          planId: newPlanId,
          planName: selectedPlan.plan_name,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update plan");
      }

      if (result.requiresPaymentMethod && result.clientSecret) {
        setPaymentIntent({
          clientSecret: result.clientSecret,
          subscriptionId: result.subscriptionId!,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update plan. Please try again.",
        variant: "destructive",
      });
      // Log error
      logger.error("Error updating plan", {
        prefix: "PlanPage",
        data: { error, profileId: profile?.id, newPlanId },
      });
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
      {paymentIntent ? (
        <div className="container max-w-md py-8">
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: paymentIntent.clientSecret,
              appearance: {
                theme: "stripe",
              },
            }}
          >
            <PaymentSetupForm
              clientSecret={paymentIntent.clientSecret}
              onSuccess={() => {
                setPaymentIntent(null);
                toast({
                  title: "Payment Method Added",
                  description: "Your subscription has been updated.",
                });
              }}
            />
          </Elements>
        </div>
      ) : (
        <div className="container py-8">
          <div className="w-full max-w-5xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Plans</h1>
              <p className="text-sm text-muted-foreground">
                Choose the plan that best fits your needs{" "}
                <span className="text-yellow-600">
                  (Changes temporarily disabled)
                </span>
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative cursor-pointer transition-all hover:shadow-md opacity-75",
                    profile?.subscription?.plans.plan_name.toLowerCase() ===
                      plan.plan_name.toLowerCase() &&
                      "border-primary shadow-sm opacity-100"
                  )}
                  onClick={() => handleUpdatePlan(plan.id)}
                >
                  {profile?.subscription?.plans.plan_name.toLowerCase() ===
                    plan.plan_name.toLowerCase() && (
                    <div className="absolute right-4 top-4">
                      <Check className="h-6 w-6 text-primary" />
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
                          <span>
                            Monitor up to {plan.channel_limit} channels
                          </span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          <span>{plan.features.ai_summary.description}</span>
                        </li>
                        {plan.features.transcription.enabled && (
                          <li className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            <span>
                              {plan.features.transcription.description}
                            </span>
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
      )}
    </AppLayout>
  );
}
