import { AppLayout } from "@/components/ui/app-layout";
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard/channels");

  return (
    <AppLayout
      breadcrumbs={[
        { label: "YouTube Channels", href: "#" },
        { label: "My Channels", active: true },
      ]}
    >
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
      <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
    </AppLayout>
  );
}
