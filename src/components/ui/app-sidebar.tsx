"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Settings2,
  Youtube,
  CreditCard,
  Receipt,
  Sparkles,
} from "lucide-react";

import { NavMain } from "@/components/ui/nav-main";
import { NavUser } from "@/components/ui/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useProfile } from "@/hooks/use-profile";
import { Logo } from "./logo";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { profile } = useProfile();

  const navMain = [
    {
      title: "YouTube Channels",
      url: "/dashboard/channels",
      icon: Youtube,
      isActive: pathname.startsWith("/dashboard/channels"),
      items: [],
    },
    {
      title: "Summarize Video",
      url: "/dashboard/summarize",
      icon: Sparkles,
      isActive: pathname.startsWith("/dashboard/summarize"),
      items: [],
      badge: "New",
    },
    {
      title: "Plans",
      url: "/dashboard/plan",
      icon: CreditCard,
      isActive: pathname.startsWith("/dashboard/plan"),
      items: [],
    },
    {
      title: "Billing",
      url: "/dashboard/billing",
      icon: Receipt,
      isActive: pathname.startsWith("/dashboard/billing"),
      items: [],
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings2,
      isActive: pathname.startsWith("/dashboard/settings"),
      items: [
        {
          title: "Appearance",
          url: "/dashboard/settings/appearance",
        },
        {
          title: "Profile",
          url: "/dashboard/settings/profile",
        },
      ],
    },
  ];

  const data = {
    user: profile
      ? {
          name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
          email: profile.email || "",
          avatar: profile.avatar_url || "",
        }
      : {
          name: "",
          email: "",
          avatar: "",
        },
    navMain,
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
