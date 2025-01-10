"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  AudioWaveform,
  Brain,
  Command,
  DollarSign,
  GalleryVerticalEnd,
  Hammer,
  Heart,
  Music,
  Settings2,
  Youtube,
} from "lucide-react";

import { NavMain } from "@/components/ui/nav-main";
/* import { NavProjects } from "@/components/ui/nav-projects";
 */ import { NavUser } from "@/components/ui/nav-user";
import { TeamSwitcher } from "@/components/ui/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { getCurrentUserAndProfile } from "@/lib/supabase";
import { Logo } from "./logo";

const userAndProfile = await getCurrentUserAndProfile();

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  const navMain = [
    {
      title: "YouTube Channels",
      url: "/dashboard/channels",
      icon: Youtube,
      isActive: pathname.startsWith("/dashboard/channels"),
      items: [
        {
          title: "List",
          url: "/dashboard/channels",
        },
        {
          title: "Add",
          url: "/dashboard/channels/new",
        },
      ],
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
        {
          title: "Plan",
          url: "/dashboard/settings/plan",
        },
      ],
    },
  ];

  const data = {
    user: {
      name:
        userAndProfile?.profile?.first_name +
          " " +
          userAndProfile?.profile?.last_name || "",
      email: userAndProfile?.email || "",
      avatar: userAndProfile?.profile?.avatar_url || "",
    },
    teams: [
      {
        name: "Acme Inc",
        logo: GalleryVerticalEnd,
        plan: "Enterprise",
      },
      {
        name: "Acme Corp.",
        logo: AudioWaveform,
        plan: "Startup",
      },
      {
        name: "Evil Corp.",
        logo: Command,
        plan: "Free",
      },
    ],
    navMain,
    projects: [
      {
        name: "AI",
        url: "#",
        icon: Brain,
      },
      {
        name: "Health",
        url: "#",
        icon: Heart,
      },
      {
        name: "Personal Finance",
        url: "#",
        icon: DollarSign,
      },
      {
        name: "Entertainment",
        url: "#",
        icon: Music,
      },
      {
        name: "How-Tos",
        url: "#",
        icon: Hammer,
      },
    ],
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Logo />
        {/*         <TeamSwitcher teams={data.teams} />
         */}{" "}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {/* <NavProjects projects={data.projects} /> */}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
