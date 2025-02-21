"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Youtube } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startChannelInfoUpdate, fetchChannelFeed } from "@/lib/youtube";
import {
  addYouTubeChannel,
  checkIfChannelIsLinked,
  getProfileChannels,
  removeYouTubeChannel,
  updateChannelSubscription,
} from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { ChannelFromXmlFeed } from "@/lib/types";
import { managePubSubHubbub } from "@/lib/pubsub";
import { logger } from "@/lib/logger";

async function subscribeToPubSubHubbub(channelId: string): Promise<string> {
  logger.info("Subscribing to PubSubHubbub", {
    prefix: "PubSubHubbub",
    data: { channelId },
  });
  const ngrokUrl =
    "https://b4ca-2a02-4e0-2d14-76e-145b-f042-77bc-70bc.ngrok-free.app";
  const callbackUrl = await managePubSubHubbub({
    channelId,
    mode: "subscribe",
    ngrokUrl,
  });
  return callbackUrl;
}

export default function AddChannelPage() {
  const { profile, isLoading: isLoadingProfile } = useProfile();
  const [channelInput, setChannelInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChannels, setCurrentChannels] = useState<number | null>(null);
  const router = useRouter();

  // Update channel limit check
  const channelLimit = profile?.subscription?.plans.channel_limit ?? 0;
  const currentChannelCount = currentChannels ?? 0;

  // Move useEffect before any conditional logic
  useEffect(() => {
    async function loadChannels() {
      if (!profile) return;

      try {
        const channels = await getProfileChannels(profile.id);
        setCurrentChannels(channels.length);
      } catch (err) {
        logger.error("Failed to load channels", {
          prefix: "Channels",
          data: { error: err instanceof Error ? err.message : "Unknown error" },
        });
        setError("Failed to load channels");
        setCurrentChannels(0);
      }
    }

    if (!isLoadingProfile) {
      loadChannels();
    }
  }, [profile, isLoadingProfile]);

  // Logging after the hook
  logger.info("Channel limit", {
    prefix: "Channels",
    data: { channelLimit },
  });

  logger.info("Current channel count", {
    prefix: "Channels",
    data: { currentChannelCount },
  });

  // Update plan limit check
  const hasReachedLimit =
    currentChannelCount != null &&
    currentChannelCount >= (profile?.subscription?.plans.channel_limit ?? 0);

  if (hasReachedLimit) {
    setError(
      `You've reached the limit of ${
        profile?.subscription?.plans.channel_limit ?? 0
      } channels for your ${
        profile?.subscription?.plans.plan_name.toLowerCase() ?? "free"
      } plan. Please upgrade to add more channels.`
    );
  }

  // Show loading state while we're loading either profile or channel count
  if (isLoadingProfile || currentChannels === null) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "YouTube Channels", href: "/dashboard/channels" },
          { label: "Add Channel", active: true },
        ]}
      >
        <div className="w-full md:w-[600px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <Youtube className="h-6 w-6" />
                Add YouTube Channel
              </CardTitle>
              <Skeleton className="h-5 w-72 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <div className="flex justify-end gap-4">
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Add input trimming
    const trimmedInput = channelInput.trim();
    if (!trimmedInput) {
      setError("Please enter a YouTube channel URL");
      return;
    }

    // 2. Profile check (existing)
    if (!profile) {
      setError("You must be logged in to add channels");
      return;
    }

    // 3. Plan limits check
    const hasReachedLimit =
      currentChannelCount != null &&
      currentChannelCount >= (profile.subscription?.plans.channel_limit ?? 0);

    if (hasReachedLimit) {
      setError(
        `You've reached the limit of ${
          profile.subscription?.plans.channel_limit ?? 0
        } channels for your ${
          profile.subscription?.plans.plan_name.toLowerCase() ?? "free"
        } plan. Please upgrade to add more channels.`
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 4. Basic URL validation before processing
      if (!trimmedInput.startsWith("http")) {
        setError(
          "Please enter a complete URL starting with http:// or https://"
        );
        setIsLoading(false);
        return;
      }

      // 5. URL validation
      const isValid = await isValidYouTubeUrl(trimmedInput);
      if (!isValid) {
        setError(
          "Invalid YouTube channel URL format. Please enter a valid URL."
        );
        setIsLoading(false);
        return;
      }

      // 6. Extract channel name with error boundary
      const url = new URL(trimmedInput);
      let channelName: string | null = null;

      try {
        if (url.pathname.startsWith("/@")) {
          channelName = url.pathname.slice(2);
        } else if (url.pathname.startsWith("/c/")) {
          channelName = url.pathname.slice(3);
        } else if (url.pathname.startsWith("/channel/")) {
          channelName = url.pathname.slice(9);
        } else {
          channelName = url.pathname.slice(1);
        }

        // Remove trailing slashes and query parameters
        channelName = channelName.split("?")[0].split("/")[0];
      } catch (err) {
        console.error("Error parsing URL:", err);
        setError("Invalid URL format. Please check the URL and try again.");
        setIsLoading(false);
        return;
      }

      if (!channelName) {
        setError(
          "Could not extract channel name from URL. Please check the format."
        );
        setIsLoading(false);
        return;
      }

      // 7. Channel fetch with timeout
      try {
        const channel: ChannelFromXmlFeed = (await Promise.race([
          fetchChannelFeed(channelName),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), 15000)
          ),
        ])) as ChannelFromXmlFeed;

        if (!channel) {
          setError("Failed to fetch channel feed");
          setIsLoading(false);
          return;
        }

        // 8. Duplicate check (existing)
        const isLinked = await checkIfChannelIsLinked(
          profile.id,
          channel.channelId
        );
        if (isLinked) {
          setError("This channel is already linked to your account.");
          setIsLoading(false);
          return;
        }

        // 9. Add channel with proper error handling
        const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          channel.title
        )}&background=random`;

        // Wrap critical operations in a transaction-like flow
        try {
          // 9. Add channel to database
          await addYouTubeChannel(profile.id, {
            id: channel.channelId,
            title: channel.title,
            thumbnail: uiAvatarUrl,
            subscriberCount: 0,
            lastVideoId: channel.lastVideoId,
            lastVideoDate: channel.lastVideoDate,
            customUrl: channel.uri,
          });

          // 10. Subscribe to PubSubHubbub notifications (required)
          const callbackUrl = await subscribeToPubSubHubbub(channel.channelId);

          // 11. Update channel subscription
          await updateChannelSubscription(
            profile.id,
            channel.channelId,
            callbackUrl
          );

          // 12. Start background update
          await startChannelInfoUpdate(channel.channelId, profile.id);

          // 13. Navigate only after all operations are complete
          router.push("/dashboard/channels");
        } catch (err) {
          // If PubSubHubbub subscription fails, we should:
          // 1. Log the error
          logger.error("Critical error during channel setup", {
            prefix: "Setup",
            data: {
              error: err instanceof Error ? err.message : "Unknown error",
              channelId: channel.channelId,
              profileId: profile.id,
            },
          });

          // 2. Try to cleanup the channel from database
          try {
            await removeYouTubeChannel(profile.id, channel.channelId);
          } catch (cleanupErr) {
            logger.error("Failed to cleanup after subscription error", {
              prefix: "Cleanup",
              data: {
                error:
                  cleanupErr instanceof Error
                    ? cleanupErr.message
                    : "Unknown error",
                channelId: channel.channelId,
                profileId: profile.id,
              },
            });
          }

          // 3. Show error to user
          throw new Error(
            "Failed to set up channel notifications. Please try again or contact support."
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === "DuplicateChannelError") {
          setError(err.message);
        } else if (err instanceof Error && err.message === "Request timeout") {
          setError("Request timed out. Please try again.");
        } else {
          logger.error("Channel fetch error", {
            prefix: "Fetch",
            data: {
              error: err instanceof Error ? err.message : "Unknown error",
            },
          });
          setError("Failed to fetch channel information. Please try again.");
        }
      }
    } catch (err) {
      logger.error("Error adding channel", {
        prefix: "Add Channel",
        data: { error: err instanceof Error ? err.message : "Unknown error" },
      });
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add channel. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  async function isValidYouTubeUrl(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);

      const validDomains = ["youtube.com", "www.youtube.com"];
      if (!validDomains.includes(parsedUrl.hostname)) {
        logger.warn("Invalid YouTube domain", {
          prefix: "Validation",
          data: { domain: parsedUrl.hostname },
        });
        return false;
      }

      const validPathPatterns = [
        /^\/@[\w-]+$/,
        /^\/c\/[\w-]+$/,
        /^\/channel\/[\w-]+$/,
        /^\/[\w-]+$/,
      ];

      const hasValidPath = validPathPatterns.some((pattern) =>
        pattern.test(parsedUrl.pathname)
      );

      if (!hasValidPath) {
        logger.warn("Invalid channel URL path", {
          prefix: "Validation",
          data: { path: parsedUrl.pathname },
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error("URL validation error", {
        prefix: "Validation",
        data: {
          name: error instanceof Error ? error.name : "Unknown",
          message: error instanceof Error ? error.message : "Unknown error",
          error,
        },
      });
      return false;
    }
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "YouTube Channels", href: "/dashboard/channels" },
        { label: "Add Channel", active: true },
      ]}
    >
      <div className="w-full md:w-[600px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Youtube className="h-6 w-6" />
              Add YouTube Channel
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              You are using {currentChannels} of{" "}
              {profile?.subscription?.plans.channel_limit || 0} channels
              available on your{" "}
              {profile?.subscription?.plans.plan_name.toLowerCase() || "free"}{" "}
              plan.
            </p>
          </CardHeader>
          <CardContent>
            {hasReachedLimit ? (
              <div className="py-6">
                <p className="text-muted-foreground mb-4">
                  You&apos;ve reached the limit of{" "}
                  {profile?.subscription?.plans.channel_limit || 0} channels for
                  your{" "}
                  {profile?.subscription?.plans.plan_name.toLowerCase() ||
                    "free"}{" "}
                  plan.
                </p>
                <Button asChild>
                  <a href="/dashboard/settings/plan">Upgrade Plan</a>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="channel"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Channel URL
                  </label>
                  <Input
                    id="channel"
                    placeholder="Enter full YouTube channel URL (e.g., https://youtube.com/@channelname)"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    disabled={isLoading}
                  />
                  {error && (
                    <p className="text-sm text-red-500 dark:text-red-400">
                      {error}
                    </p>
                  )}
                  <div className="text-sm text-muted-foreground">
                    <p>Please enter the full YouTube channel URL:</p>
                    <ul className="list-disc list-inside mt-1">
                      <li>https://youtube.com/@channelname</li>
                      <li>https://www.youtube.com/c/channelname</li>
                      <li>https://youtube.com/channel/UC...</li>
                      <li>https://youtube.com/channelname</li>
                    </ul>
                  </div>
                </div>
                <div className="flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!channelInput || isLoading}>
                    {isLoading ? (
                      <>
                        <Youtube className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Youtube className="mr-2 h-4 w-4" />
                        Add Channel
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
