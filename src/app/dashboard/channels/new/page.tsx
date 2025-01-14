"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Youtube } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getChannelInfo as startChannelInfoUpdate,
  resolveChannelId,
  fetchChannelFeed,
} from "@/lib/youtube";
import {
  addYouTubeChannel,
  checkIfChannelIsLinked,
  getProfileChannels,
} from "@/lib/supabase";
import { PLAN_LIMITS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-profile";
import { ChannelFromXmlFeed } from "@/lib/types";

export default function AddChannelPage() {
  const { profile, isLoading: isLoadingProfile } = useProfile();
  const [channelInput, setChannelInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentChannels, setCurrentChannels] = useState<number | null>(null);
  const router = useRouter();

  // Check if user has reached their plan limit
  const hasReachedLimit =
    profile &&
    currentChannels != null &&
    currentChannels >= PLAN_LIMITS[profile.plan];

  useEffect(() => {
    async function loadChannels() {
      if (!profile) return;

      try {
        const channels = await getProfileChannels(profile.id);
        setCurrentChannels(channels.length);
      } catch (err) {
        console.error("Error loading channels:", err);
        setError("Failed to load channels");
        setCurrentChannels(0); // Set to 0 on error to allow form display
      }
    }

    if (!isLoadingProfile) {
      loadChannels();
    }
  }, [profile, isLoadingProfile]);

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
    if (!profile) {
      setError("You must be logged in to add channels");
      return;
    }

    // Check plan limits first
    if (hasReachedLimit) {
      setError(
        `You've reached the limit of ${
          PLAN_LIMITS[profile.plan]
        } channels for your ${
          profile.plan
        } plan. Please upgrade to add more channels.`
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First validate URL format
      const isValid = await isValidYouTubeUrl(channelInput);
      if (!isValid) {
        setError(
          "Invalid YouTube channel URL format. Please enter a valid URL."
        );
        setIsLoading(false);
        return;
      }

      // Then resolve channel ID
      const channelId = await resolveChannelId(channelInput);
      if (!channelId) {
        setError(
          "Could not find this YouTube channel. Please check the URL and try again."
        );
        setIsLoading(false);
        return;
      }

      // Check if the channel is already linked to this profile
      const isLinked = await checkIfChannelIsLinked(profile.id, channelId);
      if (isLinked) {
        setError("This channel is already linked to your account.");
        setIsLoading(false);
        return;
      }

      try {
        const channel: ChannelFromXmlFeed = await fetchChannelFeed(channelId);
        console.log("🚀 ~ handleSubmit ~ channel:", channel);

        if (!channel) {
          setError("Failed to fetch channel feed");
          setIsLoading(false);
          return;
        }

        const uiAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          channel.title
        )}&background=random`;

        await addYouTubeChannel(profile.id, {
          id: channelId,
          title: channel.title,
          thumbnail: uiAvatarUrl,
          subscriberCount: 0,
          lastVideoId: channel.lastVideoId,
          lastVideoDate: channel.lastVideoDate,
          customUrl: channel.uri,
        });
        router.push("/dashboard/channels");
      } catch (err) {
        if (err instanceof Error && err.name === "DuplicateChannelError") {
          setError(err.message);
        } else {
          throw err;
        }
      }

      await startChannelInfoUpdate(channelId, profile.id);
    } catch (err) {
      console.error("Error adding channel:", err);
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
      // Step 1: Validate URL format
      const parsedUrl = new URL(url);

      // Step 2: Check if the URL belongs to the YouTube domain
      const validDomains = ["youtube.com", "www.youtube.com"];
      if (!validDomains.includes(parsedUrl.hostname)) {
        console.log("❌ Invalid domain:", parsedUrl.hostname);
        return false;
      }

      // Step 3: Check if the URL has a valid channel path format
      const validPathPatterns = [
        /^\/@[\w-]+$/, // @username format
        /^\/c\/[\w-]+$/, // /c/channel-name format
        /^\/channel\/[\w-]+$/, // /channel/ID format
        /^\/[\w-]+$/, // direct channel name format
      ];

      const hasValidPath = validPathPatterns.some((pattern) =>
        pattern.test(parsedUrl.pathname)
      );

      if (!hasValidPath) {
        console.log("❌ Invalid channel URL path:", parsedUrl.pathname);
        return false;
      }

      return true;
    } catch (error) {
      console.log("❌ Validation error:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : "Unknown error",
        error,
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
              {PLAN_LIMITS[profile?.plan || "free"]} channels available on your{" "}
              {profile?.plan || "free"} plan.
            </p>
          </CardHeader>
          <CardContent>
            {hasReachedLimit ? (
              <div className="py-6">
                <p className="text-muted-foreground mb-4">
                  You&apos;ve reached the limit of{" "}
                  {PLAN_LIMITS[profile?.plan || "free"]} channels for your{" "}
                  {profile?.plan || "free"} plan.
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
