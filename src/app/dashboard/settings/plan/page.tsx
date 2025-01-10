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
import { supabase } from "@/lib/supabase";
import { PLANS, UserPlan } from "@/lib/constants";

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function PlanPage() {
  const [selectedPlan, setSelectedPlan] = React.useState<UserPlan | null>(null);
  const { toast } = useToast();

  // Load current plan
  React.useEffect(() => {
    async function loadCurrentPlan() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single();

        if (profile) {
          setSelectedPlan(profile.plan);
        }
      } catch (error) {
        console.error("Error loading plan:", error);
      }
    }

    loadCurrentPlan();
  }, []);

  const handleUpdatePlan = async (planId: UserPlan) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          plan: planId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setSelectedPlan(planId);
      toast({
        title: "Plan Updated",
        description: `Successfully switched to ${PLANS[planId].name} plan`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update plan. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Plan", active: true },
      ]}
    >
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Plan Settings</h1>
          <p className="text-sm text-muted-foreground">
            Choose the plan that best fits your needs
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {(
            Object.entries(PLANS) as [UserPlan, (typeof PLANS)[UserPlan]][]
          ).map(([planId, plan]) => (
            <Card
              key={planId}
              className={cn(
                "relative cursor-pointer transition-all hover:shadow-md",
                selectedPlan === planId && "border-primary shadow-sm"
              )}
              onClick={() => handleUpdatePlan(planId)}
            >
              {selectedPlan === planId && (
                <div className="absolute right-4 top-4">
                  <Check className="h-6 w-6 text-primary" />
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {plan.name}
                    {selectedPlan === planId && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                        Current plan
                      </span>
                    )}
                  </div>
                </CardTitle>
                <CardDescription className="flex flex-col gap-1">
                  <span>{plan.description}</span>
                  <span className="inline-flex items-baseline">
                    <span className="text-2xl font-bold text-foreground">
                      {formatPrice(plan.price.amount, plan.price.currency)}
                    </span>
                    {plan.price.amount > 0 && (
                      <span className="text-muted-foreground ml-1">/month</span>
                    )}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-2xl font-bold">
                    {plan.limit} {plan.limit === 1 ? "channel" : "channels"}
                  </div>
                  <ul className="space-y-2.5 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
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
