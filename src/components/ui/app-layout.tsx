import * as React from "react";
import { AppLayoutClient } from "./app-layout-client";

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs: {
    href?: string;
    label: string;
    active?: boolean;
  }[];
}

export function AppLayout({ children, breadcrumbs }: AppLayoutProps) {
  return (
    <AppLayoutClient breadcrumbs={breadcrumbs}>{children}</AppLayoutClient>
  );
}
