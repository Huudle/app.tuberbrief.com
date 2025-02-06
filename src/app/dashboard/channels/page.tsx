"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Youtube, Users, Clock, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getRelativeTime } from "@/lib/utils";
import { getProfileChannels, deleteProfileChannel } from "@/lib/supabase";
import { ChannelListItem } from "@/lib/types";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_LIMITS } from "@/lib/constants";
import { useProfile } from "@/hooks/use-profile";
import { managePubSubHubbub } from "@/lib/pubsub";
import { logger } from "@/lib/logger";

async function unsubscribeFromPubSubHubbub(channelId: string): Promise<void> {
  logger.info("🔔 Unsubscribing from PubSubHubbub");
  const ngrokUrl =
    "https://91e4-2a02-4e0-2d19-94c-a50c-1355-d6b7-1ee3.ngrok-free.app";
  await managePubSubHubbub({
    channelId,
    mode: "unsubscribe",
    ngrokUrl,
  });
}

export default function ChannelsPage() {
  const { profile, isLoading: isLoadingProfile } = useProfile();
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function loadChannels() {
      if (!profile) return;

      try {
        const channelsData = await getProfileChannels(profile.id);
        setChannels(channelsData);
      } catch (err) {
        console.error("Error loading channels:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load channels. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (!isLoadingProfile) {
      loadChannels();
    }
  }, [profile, isLoadingProfile]);

  const handleDelete = async (channelId: string, channelChannelId: string) => {
    logger.info("🔔 Deleting channel:", {
      data: { channelId: channelChannelId },
    });
    if (!profile) return;

    try {
      setIsDeleting(channelId);
      const channel = channels.find((c) => c.id === channelId);

      if (!channel) {
        throw new Error("Channel not found");
      }

      try {
        await unsubscribeFromPubSubHubbub(channelChannelId);
      } catch (err) {
        logger.error("❌ Failed to unsubscribe from notifications:", {
          data: { error: err },
        });
      }

      await deleteProfileChannel(profile.id, channelId);

      setChannels((prevChannels) =>
        prevChannels.filter((channel) => channel.id !== channelId)
      );
    } catch (err) {
      logger.error("❌ Error deleting channel:", { data: { error: err } });
      setError(
        err instanceof Error
          ? err.message
          : "Failed to delete channel. Please try again."
      );
    } finally {
      setIsDeleting(null);
    }
  };

  const DeleteButton = ({ channel }: { channel: ChannelListItem }) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={isDeleting === channel.id}
        >
          <Trash2
            className={cn(
              "h-4 w-4",
              isDeleting === channel.id && "animate-spin"
            )}
          />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Channel</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove &quot;{channel.name}&quot; from your
            channels list? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleDelete(channel.id, channel.channelId)}
            className="bg-destructive hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const ChannelSkeleton = () => (
    <Card className="flex flex-col rounded-[5px]">
      <CardHeader className="flex flex-col space-y-4 p-4">
        <Skeleton className="w-full aspect-video rounded-[5px]" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
          <div className="grid gap-[2px]">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );

  if (isLoadingProfile || isLoading) {
    return (
      <AppLayout
        breadcrumbs={[{ label: "YouTube Channels", href: "/dashboard" }]}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">YouTube Channels</h1>
            <Skeleton className="h-5 w-48 mt-1" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <ChannelSkeleton key={i} />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (error || !profile) {
    return (
      <AppLayout
        breadcrumbs={[{ label: "YouTube Channels", href: "/dashboard" }]}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">YouTube Channels</h1>
            <p className="text-red-500 dark:text-red-400">
              {error || "You must be logged in to view channels"}
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[{ label: "YouTube Channels", href: "/dashboard" }]}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">YouTube Channels</h1>
          <p className="text-sm text-muted-foreground">
            Listing {channels.length} of {PLAN_LIMITS[profile.plan]} channels
          </p>
        </div>
        {channels.length < PLAN_LIMITS[profile.plan] && (
          <Link href="/dashboard/channels/new">
            <Button>
              <Youtube className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {channels.map((channel) => (
          <Card key={channel.id} className="flex flex-col rounded-[5px]">
            <CardHeader className="flex flex-col space-y-4 p-4">
              <a
                href={
                  channel.latestVideoId
                    ? `https://youtube.com/watch?v=${channel.latestVideoId}`
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "relative w-full aspect-video",
                  !channel.latestVideoId && "cursor-default"
                )}
              >
                <Image
                  src={
                    channel.latestVideoId
                      ? `https://i.ytimg.com/vi/${channel.latestVideoId}/mqdefault.jpg`
                      : "/video-pending.jpg"
                  }
                  alt={`${
                    channel.latestVideoId
                      ? "Latest video from"
                      : "No videos from"
                  } ${channel.name}`}
                  fill
                  priority
                  className="rounded-[5px] object-cover hover:opacity-90 transition-opacity"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
                />
              </a>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 flex-shrink-0">
                      <Image
                        src={channel.avatar}
                        alt={`${channel.name} avatar`}
                        fill
                        className="rounded-full object-cover"
                        sizes="48px"
                      />
                    </div>
                    <CardTitle className="text-base font-semibold">
                      {channel.name}
                    </CardTitle>
                  </div>
                  <DeleteButton channel={channel} />
                </div>
                <div className="grid gap-[2px] text-xs font-medium leading-relaxed">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {channel.subscriberCount.toLocaleString()} subscribers
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Last video: {getRelativeTime(channel.lastVideoDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                    <LinkIcon className="h-3.5 w-3.5 flex-shrink-0" />
                    <a
                      href={`https://youtube.com/${channel.customUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline truncate"
                    >
                      {channel.customUrl}
                    </a>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}

        {channels.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center p-6">
              <Youtube className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                No channels added yet. Click &quot;Add Channel&quot; to get
                started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
