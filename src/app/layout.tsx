import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { ProfileProvider } from "@/hooks/use-profile";

export const metadata: Metadata = {
  title: "TuberBrief - YouTube Channel Monitoring & Summarization",
  description:
    "Monitor YouTube channels, get AI-powered video summaries, and receive insights directly in your inbox.",
  keywords: [
    "YouTube",
    "AI",
    "video summaries",
    "channel monitoring",
    "content analysis",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ProfileProvider>{children}</ProfileProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
