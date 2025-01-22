import { NextResponse } from "next/server";
import { QueueWorker } from "@/lib/queue-worker";
import { EmailWorker } from "@/lib/email-worker";
import { SubscriptionWorker } from "@/lib/subscription-worker";

// Keep worker instances at module level
let queueWorker: QueueWorker | null = null;
let emailWorker: EmailWorker | null = null;
let subscriptionWorker: SubscriptionWorker | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const worker = searchParams.get("worker");

  if (action === "status") {
    return NextResponse.json({
      queue: queueWorker?.isRunning ? "running" : "stopped",
      email: emailWorker?.isRunning ? "running" : "stopped",
      subscription: subscriptionWorker?.isRunning ? "running" : "stopped",
    });
  }

  if (!worker || !action) {
    return NextResponse.json(
      { error: "Missing worker or action parameter" },
      { status: 400 }
    );
  }

  try {
    if (worker === "queue") {
      if (action === "start" && !queueWorker) {
        queueWorker = new QueueWorker();
        await queueWorker.start();
      } else if (action === "stop" && queueWorker) {
        queueWorker.stop();
        queueWorker = null;
      }
    } else if (worker === "email") {
      if (action === "start" && !emailWorker) {
        emailWorker = new EmailWorker();
        await emailWorker.start();
      } else if (action === "stop" && emailWorker) {
        emailWorker.stop();
        emailWorker = null;
      }
    } else if (worker === "subscription") {
      if (action === "start" && !subscriptionWorker) {
        subscriptionWorker = new SubscriptionWorker();
        await subscriptionWorker.start();
      } else if (action === "stop" && subscriptionWorker) {
        subscriptionWorker.stop();
        subscriptionWorker = null;
      }
    }

    return NextResponse.json({
      queue: queueWorker?.isRunning ? "running" : "stopped",
      email: emailWorker?.isRunning ? "running" : "stopped",
      subscription: subscriptionWorker?.isRunning ? "running" : "stopped",
    });
  } catch (error) {
    console.error("Worker control error:", error);
    return NextResponse.json(
      { error: "Failed to control worker" },
      { status: 500 }
    );
  }
}
