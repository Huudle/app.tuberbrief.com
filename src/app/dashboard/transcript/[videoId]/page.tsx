import { fetchCaptions } from "@/lib/captions";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/ui/app-layout";
import { TranscriptContent } from "@/components/transcript-content";

interface TranscriptPageProps {
  params: Promise<{
    videoId: string;
  }>;
}

export default async function TranscriptPage({ params }: TranscriptPageProps) {
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
      <TranscriptContent videoId={videoId} captions={captions} />
    </AppLayout>
  );
}
