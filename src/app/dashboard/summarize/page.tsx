"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/use-profile";
import { Sparkles, ArrowRight, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/ui/app-layout";

interface SummaryResult {
  videoId: string;
  title: string;
  summary: {
    briefSummary: string;
    keyPoints: string[];
    title: string;
    defaultLanguage: string;
  };
  cached: boolean;
}

export default function SummarizePage() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const { profile, isLoading: isProfileLoading } = useProfile();
  const { toast } = useToast();

  const copyToClipboard = async () => {
    if (!result) return;

    const formattedText = `${
      result.summary.title || result.title
    }\n\nSummary:\n${
      result.summary.briefSummary
    }\n\nKey Points:\n${result.summary.keyPoints
      .map((point) => `• ${point}`)
      .join("\n")}`;

    try {
      await navigator.clipboard.writeText(formattedText);
      setIsCopied(true);
      toast({
        title: "Copied!",
        description: "All content copied to clipboard",
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !profile?.id) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/youtube/summarize/instant?profileId=${profile.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to summarize video");
      }

      setResult(data);
      toast({
        title: "Success",
        description: "Video summarized successfully!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to summarize video",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isProfileLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: "Summarize Video", active: true }]}>
        <div className="h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: "Summarize Video", active: true }]}>
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Summarize YouTube Video</h1>
          <p className="text-muted-foreground">
            Get instant AI-powered summaries of any YouTube video
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Enter YouTube URL</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Summarizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Summarize Video
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardContent className="space-y-8 p-8">
              <div className="grid grid-cols-2 gap-8">
                <a
                  href={`https://youtube.com/watch?v=${result.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-video w-full overflow-hidden rounded-lg hover:opacity-95 transition-opacity"
                >
                  <img
                    src={`https://i.ytimg.com/vi/${result.videoId}/maxresdefault.jpg`}
                    alt={result.summary.title || result.title}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = `https://i.ytimg.com/vi/${result.videoId}/hqdefault.jpg`;
                    }}
                  />
                </a>
                <div>
                  <h2 className="text-2xl font-semibold line-clamp-4">
                    {result.summary.title || result.title}
                  </h2>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="font-semibold mb-3">Summary</h3>
                <p className="text-muted-foreground">
                  {result.summary.briefSummary}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Key Points</h3>
                <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                  {result.summary.keyPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>

              {!profile?.subscription && (
                <div className="bg-primary/5 p-6 rounded-lg">
                  <h3 className="font-semibold mb-3">
                    Upgrade for More Features
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get access to full transcripts, unlimited summaries, and
                    more with our Pro plan.
                  </p>
                  <Button className="w-full" asChild>
                    <a href="/dashboard/plan">
                      Upgrade Now
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}

              <div className="flex justify-start gap-4 pt-4">
                <Button size="sm" onClick={copyToClipboard} className="gap-2">
                  {isCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/dashboard/transcript/${result.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gap-2"
                  >
                    View Transcript
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
