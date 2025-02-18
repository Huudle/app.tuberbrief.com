"use client";

import { useProfile } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles, ArrowRight, Youtube } from "lucide-react";
import { CopyButton } from "@/components/copy-button";

interface TranscriptContentProps {
  videoId: string;
  captions: {
    title?: string;
    transcript: string;
  };
}

export function TranscriptContent({
  videoId,
  captions,
}: TranscriptContentProps) {
  const { profile, isLoading } = useProfile();

  // Show loading state while profile is being fetched
  if (isLoading) {
    return (
      <div className="w-full max-w-5xl space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="h-4 w-1/4 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // If profile is a free plan, show a message telling they need to upgrade
  if (!profile || profile.plan === "free") {
    return (
      <div className="w-full max-w-5xl space-y-6">
        <Card className="border-2 border-primary/20">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Unlock Full Transcripts</CardTitle>
            </div>
            <p className="text-muted-foreground">
              Upgrade your plan to access complete video transcripts and more
              powerful features
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="rounded-full bg-primary/10 p-1">
                  <svg
                    className="h-4 w-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm">Full video transcripts</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="rounded-full bg-primary/10 p-1">
                  <svg
                    className="h-4 w-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm">Instant notifications</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="rounded-full bg-primary/10 p-1">
                  <svg
                    className="h-4 w-4 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm">
                  Integrate with your own systems via webhooks
                </p>
              </div>
            </div>
            <Button className="w-full" asChild>
              <Link href="/dashboard/plan">
                Upgrade Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {captions.title || "Untitled Video"}
        </h1>
      </div>

      <Card>
        <CardContent>
          <div className="flex justify-start gap-2 my-6">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link
                href={`https://youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Youtube className="h-4 w-4" />
                Watch on YouTube
              </Link>
            </Button>
            <CopyButton text={captions.transcript} />
          </div>
          <p className="whitespace-pre-wrap leading-relaxed text-sm">
            {captions.transcript}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
