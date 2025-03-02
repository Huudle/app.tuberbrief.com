"use client";

import {
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Sparkles,
  User,
  Receipt,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabaseAnon } from "@/lib/supabase";
import { useProfile } from "@/hooks/use-profile";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();

  // Always call hooks at the top level - required by React rules
  const { profile, isLoading } = useProfile();
  const [showUpgrade, setShowUpgrade] = React.useState(false);
  const [isMounted, setIsMounted] = React.useState(false);

  // Use this effect to mark when component is mounted in browser
  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle profile data changes in useEffect to avoid re-render loops
  React.useEffect(() => {
    // Only run on client-side after initial mount
    if (!isMounted) return;

    // Only process when profile data is loaded and stable
    if (!isLoading && profile !== undefined) {
      const isFreePlan =
        !profile?.subscription ||
        (profile.subscription.plans &&
          profile.subscription.plans.plan_name.toLowerCase() === "free");
      setShowUpgrade(isFreePlan);
    }
  }, [profile, isLoading, isMounted]);

  const handleLogout = async () => {
    try {
      // First sign out from Supabase
      const { error } = await supabaseAnon.auth.signOut();
      if (error) throw error;

      // Then call the auth callback to clear the cookie
      const response = await fetch("/api/auth/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: "SIGNED_OUT",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to clear session cookie");
      }

      // Redirect to login page
      window.location.href = "/login";
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleUpgrade = () => {
    router.push("/dashboard/plan");
  };

  const handleProfileClick = () => {
    router.push("/dashboard/settings/profile");
  };

  const handleBillingClick = () => {
    router.push("/dashboard/billing");
  };

  const handlePlansClick = () => {
    router.push("/dashboard/plan");
  };

  // Early return a simplified version during SSR or before client mount
  if (!isMounted) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            {/* No menu content during SSR */}
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  // Full component rendered only on client after mount
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {showUpgrade && (
                <DropdownMenuItem onClick={handleUpgrade}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Upgrade
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={handlePlansClick}>
                <CreditCard className="mr-2 h-4 w-4" />
                Plans
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleBillingClick}>
                <Receipt className="mr-2 h-4 w-4" />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleProfileClick}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
