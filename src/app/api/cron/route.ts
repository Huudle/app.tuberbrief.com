import { NextResponse } from "next/server";
import { QueueWorker } from "@/lib/queue-worker";
import { EmailWorker } from "@/lib/email-worker";
import { SubscriptionWorker } from "@/lib/subscription-worker";

// Initialize workers
const queueWorker = new QueueWorker();
const emailWorker = new EmailWorker();
const subscriptionWorker = new SubscriptionWorker();

// This API endpoint is used to start the workers and it is invoked by the cron job on Supabase
// For development and staging, the cron job is triggered by the start-cron-*.sh scripts
export async function GET() {
  try {
    // Start workers without awaiting their infinite loops
    queueWorker.start().catch(console.error);
    emailWorker.start().catch(console.error);
    subscriptionWorker.start().catch(console.error);

    return NextResponse.json({ status: "Workers invoked successfully" });
  } catch (error) {
    console.error("Failed to invoke workers:", error);
    return NextResponse.json(
      { error: "Failed to invoke workers" },
      { status: 500 }
    );
  }
}
