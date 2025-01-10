"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { UserPlan } from "@/lib/constants";

export function Logo() {
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);

  useEffect(() => {
    async function loadUserPlan() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", user.id)
          .single();

        if (profile) {
          setUserPlan(profile.plan);
        }
      } catch (error) {
        console.error("Error loading user plan:", error);
      }
    }

    loadUserPlan();
  }, []);

  return (
    <div className="flex items-center gap-2 p-2">
      <Link href="/dashboard" className="flex items-center h-6">
        <Image
          src="/logo-001.png"
          alt="Flow Fusion Logo"
          width={512}
          height={512}
          priority
          className="h-full w-auto dark:invert"
        />
      </Link>
      {userPlan && (
        <Badge variant="default" className="capitalize text-xs px-2 py-0">
          {userPlan} plan
        </Badge>
      )}
    </div>
  );
}
