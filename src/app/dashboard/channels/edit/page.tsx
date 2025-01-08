"use client";

import { AppLayout } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Pencil, Trash2, Youtube } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface Channel {
  id: string;
  name: string;
  url: string;
  subscriberCount: number;
  lastVideoDate: string;
  thumbnail: string;
  latestVideoId?: string;
  avatar: string;
}

export default function ChannelsPage() {
  // This would come from your database
  const channels: Channel[] = [
    {
      id: "1",
      name: "Y Combinator",
      url: "https://www.youtube.com/@ycombinator",
      subscriberCount: 1600000,
      lastVideoDate: "2024-03-20",
      thumbnail: "https://i.ytimg.com/vi/1hHMwLxN6EM/hqdefault.jpg",
      latestVideoId: "1hHMwLxN6EM",
      avatar:
        "https://yt3.ggpht.com/dGyATx87Fp_s1nZvnupUFSnMqbAPZ6nqRby9Esk1m6YE41iBq-9Z8iGoIgHTCT9SiDBUpP2V=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      id: "2",
      name: "Barış Soydan",
      url: "https://www.youtube.com/@barissoydan",
      subscriberCount: 125000,
      lastVideoDate: "2024-03-19",
      thumbnail: "https://i.ytimg.com/vi/O8Mn4mh9VcY/hqdefault.jpg",
      latestVideoId: "O8Mn4mh9VcY",
      avatar:
        "https://yt3.ggpht.com/y51Rdxmlcir97_GTdQ7cFuvGNk7fFjwM8XOTyQDNvLukShyLgYCKXHLuXdI_Nv27zKordrSYUg=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      id: "3",
      name: "Fireship",
      url: "https://www.youtube.com/@Fireship",
      subscriberCount: 2100000,
      lastVideoDate: "2024-03-21",
      thumbnail: "https://i.ytimg.com/vi/rFP7rUYtOOg/hqdefault.jpg",
      latestVideoId: "rFP7rUYtOOg",
      avatar:
        "https://yt3.ggpht.com/ytc/AIdro_mKzklyPPhghBJQH5H3HpZ108YcE618DBRLAvRUD1AjKNw=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      id: "4",
      name: "Atilla Yeşilada",
      url: "https://www.youtube.com/c/AtillaYe%C5%9Filada",
      subscriberCount: 280000,
      lastVideoDate: "2024-03-18",
      thumbnail: "https://i.ytimg.com/vi/gp5Pma9rGEI/hqdefault.jpg",
      latestVideoId: "gp5Pma9rGEI",
      avatar:
        "https://yt3.ggpht.com/ytc/AIdro_mW39oJNb0T558Cl7ajX6OBgGJKaTU0oNMu3K2GNor60g=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      id: "5",
      name: "Vogue",
      url: "https://www.youtube.com/@Vogue",
      subscriberCount: 15000,
      lastVideoDate: "2024-03-15",
      thumbnail: "https://i.ytimg.com/vi/HJX_ypzVKF8/hqdefault.jpg",
      latestVideoId: "HJX_ypzVKF8",
      avatar:
        "https://yt3.ggpht.com/pjWEB6VpO5GmzI7aGg6pAjkNSdLf75LKoUXmmj2HAs1Fq1V1zlcevvR4hf7J9VtV7fYxaYJHS8g=s88-c-k-c0x00ffffff-no-rj",
    },
    {
      id: "6",
      name: "The David Lin Report",
      url: "https://www.youtube.com/@TheDavidLinReport",
      subscriberCount: 45000,
      lastVideoDate: "2024-03-17",
      thumbnail: "https://i.ytimg.com/vi/zjoC_hC90Gc/hqdefault.jpg",
      latestVideoId: "zjoC_hC90Gc",
      avatar:
        "https://yt3.ggpht.com/DmfJ4qf4FPrNKlnCywnRpxrknxipH3T1lCXOMCwIa1fQ3GL6Fzxx_vmSMqpgyL0iReHJLyLPzg=s88-c-k-c0x00ffffff-no-rj",
    },
  ];

  const userPlan = "pro"; // This would come from your user's data
  const planLimits = {
    free: 1,
    basic: 5,
    pro: 15,
  };

  const handleDelete = async (channelId: string) => {
    // Add delete logic here
    console.log("Deleting channel:", channelId);
  };

  return (
    <AppLayout
      breadcrumbs={[
        { label: "YouTube Channels", href: "/dashboard" },
        { label: "Edit", active: true },
      ]}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">My YouTube Channels</h1>
          <p className="text-muted-foreground">
            Managing {channels.length} of {planLimits[userPlan]} channels (
            {userPlan} plan)
          </p>
        </div>
        {channels.length < planLimits[userPlan] && (
          <Link href="/dashboard/channels/new">
            <Button>
              <Youtube className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {channels.map((channel) => (
          <Card key={channel.id} className="flex flex-col">
            <CardHeader className="flex flex-col space-y-4 pb-2">
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
                  className="rounded-md object-cover hover:opacity-90 transition-opacity"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </a>
              <div className="flex justify-between items-start">
                <div className="flex gap-3">
                  <div className="relative h-10 w-10 flex-shrink-0">
                    <Image
                      src={channel.avatar}
                      alt={`${channel.name} avatar`}
                      fill
                      className="rounded-full object-cover"
                      sizes="40px"
                    />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold">
                      {channel.name}
                    </CardTitle>
                    <CardDescription>
                      <div className="grid gap-0.5">
                        <p>
                          {channel.subscriberCount.toLocaleString()} subscribers
                        </p>
                        <p>Last video: {channel.lastVideoDate}</p>
                        <p className="truncate">{channel.url}</p>
                      </div>
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDelete(channel.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
