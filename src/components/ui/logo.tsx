"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/use-profile";

export function Logo() {
  const { profile, isLoading } = useProfile();

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
      {!isLoading && profile?.plan && (
        <Badge variant="default" className="capitalize text-xs px-2 py-0">
          {profile.plan}
        </Badge>
      )}
    </div>
  );
}
