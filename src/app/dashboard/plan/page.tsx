"use client";

import * as React from "react";
import { Check } from "lucide-react";

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

interface PlanFeatures {
  plan: {
    name: string;
    description: string;
    highlight: string;
  };
  limits: {
    channels: number;
    notifications: number;
    description: string;
  };
  transcription: {
    enabled: boolean;
    description: string;
    tooltip: string;
    disabled_message?: string;
  };
  ai_summary: {
    enabled: boolean;
    description: string;
    tooltip: string;
    disabled_message?: string;
  };
  instant_notification: {
    enabled: boolean;
    description: string;
    tooltip: string;
    disabled_message?: string;
  };
  webhooks: {
    enabled: boolean;
    description: string;
    tooltip: string;
    disabled_message?: string;
  };
  priority_support: {
    enabled: boolean;
    description: string;
    tooltip: string;
    disabled_message?: string;
  };
  notifications: {
    type: string;
    description: string;
    tooltip: string;
    upgrade_message?: string;
  };
}

interface Plan {
  id: string;
  plan_name: string;
  monthly_email_limit: number;
  monthly_cost: number;
  channel_limit: number;
  features: PlanFeatures;
  stripe_price_id: string;
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function PlanPage() {
  const { profile, isLoading: profileLoading, refreshProfile } = useProfile();
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

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

  const handleUpdatePlan = async (planId: string) => {
    // Prevent plan changes temporarily
    toast({
      title: "Plan Changes Disabled",
      description:
        "Plan changes are temporarily disabled. Please check back later.",
    });
    return;
  };

  if (isLoading || profileLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Plans", active: true }]}>
        <div className="w-full max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Plans</h1>
            <p className="text-sm text-muted-foreground">
              Choose the plan that best fits your needs
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="relative">
                <CardHeader>
                  <Skeleton className="h-7 w-24 mb-2" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-8 w-20 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-32" />
                    <div className="space-y-2.5">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <Skeleton className="h-4 w-4" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Plans", active: true }]}>
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
                profile?.plan === plan.plan_name.toLowerCase() &&
                  "border-primary shadow-sm opacity-100"
              )}
              onClick={() => handleUpdatePlan(plan.id)}
            >
              {profile?.plan === plan.plan_name.toLowerCase() && (
                <div className="absolute right-4 top-4">
                  <Check className="h-6 w-6 text-primary" />
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {plan.features.plan.name}
                    {profile?.plan === plan.plan_name.toLowerCase() && (
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
                      <span className="text-muted-foreground ml-1">/month</span>
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
    </AppLayout>
  );
}
