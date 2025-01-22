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
    // Start all workers
    await Promise.all([
      queueWorker.start(),
      emailWorker.start(),
      subscriptionWorker.start(),
    ]);

    return NextResponse.json({ status: "Workers started successfully" });
  } catch (error) {
    console.error("Failed to start workers:", error);
    return NextResponse.json(
      { error: "Failed to start workers" },
      { status: 500 }
    );
  }
}
