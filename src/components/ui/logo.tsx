"use client";

import Image from "next/image";
import Link from "next/link";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function Logo() {
  const { state } = useSidebar();

  return (
    <div className="flex items-center gap-2 p-2">
      <Link href="/dashboard" className="flex items-center h-6">
        <Image
          src="/logo-001.png"
          alt="TuberBrief Logo"
          width={512}
          height={512}
          priority
          className={cn(
            "h-full w-auto dark:invert transition-opacity duration-200",
            state === "collapsed" ? "opacity-0" : "opacity-100"
          )}
        />
      </Link>
    </div>
  );
}
