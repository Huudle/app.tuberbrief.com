"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Youtube } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getChannelInfo } from "@/lib/youtube";
import { addYouTubeChannel } from "@/lib/supabase";
import { getCurrentUserAndProfile, getProfileChannels } from "@/lib/supabase";
import { PLAN_LIMITS, UserPlan } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

export default function AddChannelPage() {
  const [channelInput, setChannelInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChannels, setCurrentChannels] = useState<number>(0);
  const [userPlan, setUserPlan] = useState<UserPlan>("free");
  const router = useRouter();

  useEffect(() => {
    async function loadUserData() {
      try {
        const user = await getCurrentUserAndProfile();
        if (!user) {
          router.push("/login");
          return;
        }

        setUserPlan(user.profile?.plan || "free");
        const channels = await getProfileChannels(user.id);
        setCurrentChannels(channels.length);
      } catch (err) {
        console.error("Error loading user data:", err);
        setError("Failed to load user data");
      } finally {
        setIsInitializing(false);
      }
    }

    loadUserData();
  }, [router]);

  if (isInitializing) {
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
    setIsLoading(true);
    setError(null);

    try {
      // Get current user
      const user = await getCurrentUserAndProfile();
      if (!user) {
        setError("You must be logged in to add channels");
        return;
      }

      // Check plan limits
      if (currentChannels >= PLAN_LIMITS[userPlan]) {
        setError(
          `You&apos;ve reached the limit of ${PLAN_LIMITS[userPlan]} channels for your ${userPlan} plan. Please upgrade to add more channels.`
        );
        return;
      }

      // Get channel info from YouTube
      const channelInfo = await getChannelInfo(channelInput);
      if (!channelInfo) {
        setError("Channel not found. Please check the URL or channel name.");
        return;
      }

      // Save channel to database
      try {
        await addYouTubeChannel(user.id, {
          id: channelInfo.id,
          title: channelInfo.title,
          thumbnail: channelInfo.thumbnail,
          subscriberCount: channelInfo.subscriberCount,
          lastVideoId: channelInfo.lastVideoId || "",
          lastVideoDate: channelInfo.lastVideoDate || new Date().toISOString(),
        });

        // Redirect back to channels list
        router.push("/dashboard/channels");
      } catch (err) {
        if (err instanceof Error && err.name === "DuplicateChannelError") {
          setError(err.message);
        } else {
          throw err; // Re-throw other errors to be caught by outer catch block
        }
      }
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
              You are using {currentChannels} of {PLAN_LIMITS[userPlan]}{" "}
              channels available on your {userPlan} plan.
            </p>
          </CardHeader>
          <CardContent>
            {currentChannels >= PLAN_LIMITS[userPlan] ? (
              <div className="py-6">
                <p className="text-muted-foreground mb-4">
                  You&apos;ve reached the limit of {PLAN_LIMITS[userPlan]}{" "}
                  channels for your {userPlan} plan.
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
                    Channel URL or Name
                  </label>
                  <Input
                    id="channel"
                    placeholder="Enter channel URL (e.g., https://youtube.com/@channelname) or just the channel name"
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
                    <p>You can enter either:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>
                        Full channel URL (https://youtube.com/@channelname)
                      </li>
                      <li>Channel handle (@channelname)</li>
                      <li>Channel name (without @)</li>
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
