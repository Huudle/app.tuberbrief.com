"use client";

import * as React from "react";
import { supabaseAnon } from "@/lib/supabase";
import { getDefaultAvatar } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useState, useEffect } from "react";
import { Profile } from "@/lib/types";

interface ProfileContext {
  profile: Profile | null;
  isLoading: boolean;
  error: Error | null;
  refreshProfile: () => Promise<void>;
}

// Cache for profile data
let profileCache: {
  profile: Profile | null;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 30000; // 30 seconds

const ProfileContext = React.createContext<ProfileContext | undefined>(
  undefined
);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const loadingRef = React.useRef(false);

  const loadProfile = React.useCallback(async (force = false) => {
    if (loadingRef.current) return;

    // Check cache if not forcing refresh
    if (
      !force &&
      profileCache &&
      Date.now() - profileCache.timestamp < CACHE_DURATION
    ) {
      setProfile(profileCache.profile);
      setIsLoading(false);
      return;
    }

    loadingRef.current = true;

    try {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabaseAnon.auth.getUser();

      if (!user) {
        setProfile(null);
        profileCache = { profile: null, timestamp: Date.now() };
        return;
      }

      const { data: profileWithSubscription, error } = await supabaseAnon
        .from("profiles")
        .select(
          `
          *,
          subscriptions!inner(
            id,
            plan_id,
            status,
            usage_count,
            start_date,
            end_date,
            stripe_customer_id,
            stripe_subscription_id,
            plans!inner(
              id,
              plan_name,
              monthly_email_limit,
              channel_limit,
              monthly_cost
            )
          )
        `
        )
        .eq("id", user.id)
        .single();

      logger.info("Profile data", {
        prefix: "ProfileProvider",
        data: profileWithSubscription,
      });

      if (error) throw error;

      const profileData = {
        ...profileWithSubscription,
        email: user.email,
        avatar_url:
          profileWithSubscription.avatar_url ||
          getDefaultAvatar({ email: profileWithSubscription.email }),
        subscription: profileWithSubscription.subscriptions
          ? {
              id: profileWithSubscription.subscriptions.id,
              plan_id: profileWithSubscription.subscriptions.plan_id,
              status: profileWithSubscription.subscriptions.status,
              usage_count: profileWithSubscription.subscriptions.usage_count,
              start_date: profileWithSubscription.subscriptions.start_date,
              end_date: profileWithSubscription.subscriptions.end_date,
              plans: profileWithSubscription.subscriptions.plans,
              limits: {
                channels:
                  profileWithSubscription.subscriptions.plans.channel_limit,
                monthlyEmails:
                  profileWithSubscription.subscriptions.plans
                    .monthly_email_limit,
              },
              stripe_customer_id:
                profileWithSubscription.subscriptions.stripe_customer_id,
              stripe_subscription_id:
                profileWithSubscription.subscriptions.stripe_subscription_id,
            }
          : null,
      };

      setProfile(profileData);
      profileCache = { profile: profileData, timestamp: Date.now() };
    } catch (e) {
      console.error("Error loading profile:", e);
      setError(e instanceof Error ? e : new Error("Failed to load profile"));
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    loadProfile();

    const {
      data: { subscription },
    } = supabaseAnon.auth.onAuthStateChange(() => {
      loadProfile(true); // Force refresh on auth state change
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = React.useCallback(
    () => loadProfile(true),
    [loadProfile]
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        error,
        refreshProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabaseAnon.auth.getUser();
        if (userError || !user) throw userError;

        const { data: profileWithSubscription, error: profileError } =
          await supabaseAnon
            .from("profiles")
            .select(
              `
            *,
            subscriptions!inner(
              id,
              plan_id,
              status,
              usage_count,
              start_date,
              end_date,
              stripe_customer_id,
              stripe_subscription_id,
              plans!inner(
                id,
                plan_name,
                monthly_email_limit,
                channel_limit,
                monthly_cost
              )
            )
          `
            )
            .eq("id", user.id)
            .single();

        if (profileError) throw profileError;

        setProfile({
          ...profileWithSubscription,
          email: user.email,
          avatar_url:
            profileWithSubscription.avatar_url ||
            getDefaultAvatar({ email: profileWithSubscription.email }),
          subscription: profileWithSubscription.subscriptions
            ? {
                id: profileWithSubscription.subscriptions.id,
                plan_id: profileWithSubscription.subscriptions.plan_id,
                status: profileWithSubscription.subscriptions.status,
                usage_count: profileWithSubscription.subscriptions.usage_count,
                start_date: profileWithSubscription.subscriptions.start_date,
                end_date: profileWithSubscription.subscriptions.end_date,
                plans: profileWithSubscription.subscriptions.plans,
                limits: {
                  channels:
                    profileWithSubscription.subscriptions.plans.channel_limit,
                  monthlyEmails:
                    profileWithSubscription.subscriptions.plans
                      .monthly_email_limit,
                },
                stripe_customer_id:
                  profileWithSubscription.subscriptions.stripe_customer_id,
                stripe_subscription_id:
                  profileWithSubscription.subscriptions.stripe_subscription_id,
              }
            : null,
        });
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  return { profile, isLoading, refreshProfile: () => {} };
}
