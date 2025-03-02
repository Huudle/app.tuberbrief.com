"use client";

import Image from "next/image";
import Link from "next/link";

export function Logo() {
  return (
    <div className="flex items-center gap-2 p-2">
      <Link href="/dashboard" className="flex items-center h-6">
        <Image
          src="/logo-001.png"
          alt="TuberBrief Logo"
          width={512}
          height={512}
          priority
          className="h-full w-auto dark:invert"
        />
      </Link>
    </div>
  );
}
