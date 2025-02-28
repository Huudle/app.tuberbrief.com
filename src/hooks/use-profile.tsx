"use client";

import * as React from "react";
import { supabaseAnon } from "@/lib/supabase";
import { getDefaultAvatar } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { Profile } from "@/lib/types";

interface ProfileContext {
  profile: Profile | null;
  isLoading: boolean;
  error: Error | null;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = React.createContext<ProfileContext | undefined>(
  undefined
);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const loadingRef = React.useRef(false);
  const isMounted = React.useRef(true);
  const loadAttempts = React.useRef(0);
  const initialLoadDone = React.useRef(false);
  const lastLoadTime = React.useRef(0);
  const lastLoadedProfile = React.useRef<Profile | null>(null);

  const loadProfile = React.useCallback(async (force = false) => {
    if (!isMounted.current) return;

    const now = Date.now();
    // If not forcing and we have a recent load, use the cached data
    if (
      !force &&
      lastLoadedProfile.current &&
      now - lastLoadTime.current < 30000
    ) {
      logger.info("📦 Using recently loaded profile data", {
        prefix: "ProfileProvider",
        data: {
          age: now - lastLoadTime.current,
          profileId: lastLoadedProfile.current.id,
        },
      });
      setProfile(lastLoadedProfile.current);
      setIsLoading(false);
      return;
    }

    // If we're already loading, skip this request
    if (loadingRef.current) {
      logger.info("⏳ Skipping duplicate load request", {
        prefix: "ProfileProvider",
        data: {
          force,
          isInitialLoad: !initialLoadDone.current,
        },
      });
      return;
    }

    loadingRef.current = true;
    loadAttempts.current += 1;
    const attemptId = loadAttempts.current;

    try {
      logger.info("🔄 Starting profile load attempt", {
        prefix: "ProfileProvider",
        data: {
          attemptId,
          force,
          isInitialLoad: !initialLoadDone.current,
        },
      });

      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabaseAnon.auth.getUser();

      if (!isMounted.current) return;
      if (userError) throw userError;

      if (!user) {
        setProfile(null);
        lastLoadedProfile.current = null;
        lastLoadTime.current = now;
        setIsLoading(false);
        return;
      }

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

      if (!isMounted.current) return;
      if (profileError) throw profileError;

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

      if (isMounted.current) {
        logger.info("✅ Profile data loaded successfully", {
          prefix: "ProfileProvider",
          data: {
            attemptId,
            profileId: profileData.id,
            hasSubscription: !!profileData.subscription,
          },
        });

        lastLoadedProfile.current = profileData;
        lastLoadTime.current = now;
        setProfile(profileData);
        initialLoadDone.current = true;
      }
    } catch (e) {
      if (!isMounted.current) return;

      logger.error("❌ Error loading profile", {
        prefix: "ProfileProvider",
        data: {
          attemptId,
          error: e instanceof Error ? e.message : "Unknown error",
          stack: e instanceof Error ? e.stack : undefined,
        },
      });

      setError(e instanceof Error ? e : new Error("Failed to load profile"));
      lastLoadedProfile.current = null;
      lastLoadTime.current = 0;
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
      loadingRef.current = false;
    }
  }, []);

  // Handle auth state changes
  React.useEffect(() => {
    let mounted = true;
    const {
      data: { subscription },
    } = supabaseAnon.auth.onAuthStateChange((event, session) => {
      if (!mounted || !isMounted.current) return;

      logger.info("🔐 Auth state changed", {
        prefix: "ProfileProvider",
        data: {
          event,
          userId: session?.user?.id,
          hasProfile: !!profile,
          isLoading: loadingRef.current,
        },
      });

      if (event === "SIGNED_IN") {
        // Small delay to avoid race conditions with other auth state changes
        setTimeout(() => {
          if (mounted && isMounted.current) {
            loadProfile(true);
          }
        }, 100);
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        lastLoadedProfile.current = null;
        lastLoadTime.current = 0;
        initialLoadDone.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Initial profile load
  React.useEffect(() => {
    loadProfile();
    return () => {
      isMounted.current = false;
    };
  }, [loadProfile]);

  const refreshProfile = React.useCallback(() => {
    return loadProfile(true);
  }, [loadProfile]);

  const value = React.useMemo(
    () => ({
      profile,
      isLoading,
      error,
      refreshProfile,
    }),
    [profile, isLoading, error, refreshProfile]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = React.useContext(ProfileContext);
  if (context === undefined) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}
