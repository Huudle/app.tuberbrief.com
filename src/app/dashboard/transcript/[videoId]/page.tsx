import { fetchCaptions } from "@/lib/captions";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/ui/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface TranscriptPageProps {
  params: Promise<{
    videoId: string;
  }>;
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
  // Await the params
  const { videoId } = await params;

  const captions = await fetchCaptions(videoId);

  if (!captions) {
    notFound();
  }

  return (
    <AppLayout
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Transcript", active: true },
      ]}
    >
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Video Transcript</h1>
            <p className="text-sm text-muted-foreground">
              Full transcript for video: {videoId}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            {captions.title && <CardTitle>{captions.title}</CardTitle>}
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-relaxed">
              {captions.transcript}
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
