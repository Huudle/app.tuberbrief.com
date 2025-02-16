import { NextResponse } from "next/server";
import { QueueWorker } from "@/lib/queue-worker";
import { EmailWorker } from "@/lib/email-worker";
import { YouTubeSubscriptionWorker } from "@/lib/youtube-subscription-worker";
import { SubscriptionCheckWorker } from "@/lib/subscription-check-worker";
import { logger } from "@/lib/logger";

// Keep worker instances at module level
let queueWorker: QueueWorker | null = null;
let emailWorker: EmailWorker | null = null;
let youtubeSubscriptionWorker: YouTubeSubscriptionWorker | null = null;
let subscriptionCheckWorker: SubscriptionCheckWorker | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const worker = searchParams.get("worker");

  if (action === "status") {
    return NextResponse.json({
      queue: queueWorker?.isRunning ? "running" : "stopped",
      email: emailWorker?.isRunning ? "running" : "stopped",
      subscription: youtubeSubscriptionWorker?.isRunning
        ? "running"
        : "stopped",
      subscriptionCheck: subscriptionCheckWorker?.isRunning
        ? "running"
        : "stopped",
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
      if (action === "start" && !youtubeSubscriptionWorker) {
        youtubeSubscriptionWorker = new YouTubeSubscriptionWorker();
        await youtubeSubscriptionWorker.start();
      } else if (action === "stop" && youtubeSubscriptionWorker) {
        youtubeSubscriptionWorker.stop();
        youtubeSubscriptionWorker = null;
      }
    } else if (worker === "subscription-check") {
      if (action === "start" && !subscriptionCheckWorker) {
        subscriptionCheckWorker = new SubscriptionCheckWorker();
        await subscriptionCheckWorker.start();
      } else if (action === "stop" && subscriptionCheckWorker) {
        subscriptionCheckWorker.stop();
        subscriptionCheckWorker = null;
      }
    }

    return NextResponse.json({
      queue: queueWorker?.isRunning ? "running" : "stopped",
      email: emailWorker?.isRunning ? "running" : "stopped",
      subscription: youtubeSubscriptionWorker?.isRunning
        ? "running"
        : "stopped",
      subscriptionCheck: subscriptionCheckWorker?.isRunning
        ? "running"
        : "stopped",
    });
  } catch (error) {
    logger.error("💥 Error starting workers", {
      prefix: "Worker",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json(
      { error: "Failed to control worker" },
      { status: 500 }
    );
  }
}
