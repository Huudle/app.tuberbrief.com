"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Youtube, Users, Clock, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getRelativeTime } from "@/lib/utils";
import {
  getCurrentUserAndProfile,
  getProfileChannels,
  deleteProfileChannel,
  ChannelListItem,
} from "@/lib/supabase";
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
import { PLAN_LIMITS, UserPlan } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan>("free");

  useEffect(() => {
    async function loadChannels() {
      try {
        const user = await getCurrentUserAndProfile();
        if (!user) {
          setError("You must be logged in to view channels");
          return;
        }

        setUserPlan(user.profile?.plan || "free");

        const channelsData = await getProfileChannels(user.id);
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

    loadChannels();
  }, []);

  const handleDelete = async (channelId: string) => {
    try {
      setIsDeleting(channelId);

      const user = await getCurrentUserAndProfile();
      if (!user) {
        setError("You must be logged in to delete channels");
        return;
      }

      await deleteProfileChannel(user.id, channelId);

      // Update the local state to remove the deleted channel
      setChannels((prevChannels) =>
        prevChannels.filter((channel) => channel.id !== channelId)
      );
    } catch (err) {
      console.error("Error deleting channel:", err);
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
            onClick={() => handleDelete(channel.id)}
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

  if (isLoading) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "YouTube Channels", href: "/dashboard" },
          { label: "List", active: true },
        ]}
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

  if (error) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "YouTube Channels", href: "/dashboard" },
          { label: "List", active: true },
        ]}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">YouTube Channels</h1>
            <p className="text-red-500 dark:text-red-400">{error}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "YouTube Channels", href: "/dashboard" },
        { label: "List", active: true },
      ]}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">YouTube Channels</h1>
          <p className="text-sm text-muted-foreground">
            Listing {channels.length} of {PLAN_LIMITS[userPlan]} channels
          </p>
        </div>
        {channels.length < PLAN_LIMITS[userPlan] && (
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
                href={`https://youtube.com/watch?v=${channel.latestVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-full aspect-video"
              >
                <Image
                  src={`https://i.ytimg.com/vi/${channel.latestVideoId}/mqdefault.jpg`}
                  alt={`Latest video from ${channel.name}`}
                  fill
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
                      href={`https://youtube.com/@${channel.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline truncate"
                    >
                      @{channel.url}
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
