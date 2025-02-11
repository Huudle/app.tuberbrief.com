import axios from "axios";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const PUBSUBHUBBUB_HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

export async function POST(request: Request) {
  const startTime = performance.now();
  logger.info("🚀 Starting PubSubHubbub subscription request", {
    prefix: "PubSubHubbub",
  });

  try {
    const body = await request.json();
    const { callbackUrl, topicUrl, mode = "subscribe" } = body;
    logger.info("📝 Request body:", {
      prefix: "PubSubHubbub",
      data: {
        callbackUrl,
        topicUrl,
        mode,
        verifyToken: body.verifyToken ? "✓" : "✗",
        secret: body.secret ? "✓" : "✗",
        leaseSeconds: body.leaseSeconds,
      },
    });

    if (!callbackUrl || !topicUrl) {
      logger.warn("⚠️ Missing required parameters", { prefix: "PubSubHubbub" });
      return NextResponse.json(
        { error: "Callback URL and Topic URL are required" },
        { status: 400 }
      );
    }

    // Validate mode
    if (mode !== "subscribe" && mode !== "unsubscribe") {
      logger.warn("⚠️ Invalid mode:", {
        prefix: "PubSubHubbub",
        data: { mode },
      });
      return NextResponse.json(
        { error: "Mode must be either 'subscribe' or 'unsubscribe'" },
        { status: 400 }
      );
    }

    // Prepare form data
    const formData = new URLSearchParams();
    formData.append("hub.callback", callbackUrl);
    formData.append("hub.topic", topicUrl);
    formData.append("hub.verify", "async"); // Default to async verification
    formData.append("hub.mode", mode);

    // Optional parameters
    if (body.verifyToken) {
      formData.append("hub.verify_token", body.verifyToken);
      logger.info("🔑 Added verify token to request", {
        prefix: "PubSubHubbub",
      });
    }
    if (body.secret) {
      formData.append("hub.secret", body.secret);
      logger.info("🔒 Added secret to request", { prefix: "PubSubHubbub" });
    }
    if (body.leaseSeconds) {
      formData.append("hub.lease_seconds", body.leaseSeconds.toString());
      logger.info("⏱️ Added lease seconds", {
        prefix: "PubSubHubbub",
        data: { leaseSeconds: body.leaseSeconds },
      });
    }

    logger.info("📤 Sending request to PubSubHubbub hub...", {
      prefix: "PubSubHubbub",
    });
    // Submit the form
    const response = await axios.post(PUBSUBHUBBUB_HUB_URL, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      validateStatus: (status) => {
        // PubSubHubbub returns 204 or 202 on success
        // 204: No Content - Immediate success
        // 202: Accepted - Request accepted for processing
        return status === 204 || status === 202;
      },
    });

    logger.info("📥 Response details", {
      prefix: "PubSubHubbub",
      data: {
        status: response.status,
        headers: response.headers,
        data: response.data || "No content",
      },
    });

    const endTime = performance.now();
    logger.info("✅ Subscription request successful", {
      prefix: "PubSubHubbub",
      data: { duration: `${(endTime - startTime).toFixed(2)}ms` },
    });

    // If we get here, the subscription request was successful
    return NextResponse.json({
      success: true,
      message: `${mode} request submitted successfully`,
    });
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 PubSubHubbub subscription error", {
      prefix: "PubSubHubbub",
      data: {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    if (axios.isAxiosError(error)) {
      logger.error("❌ Detailed error information", {
        prefix: "PubSubHubbub",
        data: {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        },
      });
    }

    return NextResponse.json(
      {
        error: "Failed to submit subscription request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Example usage for subscription details
export async function GET(request: Request) {
  const startTime = performance.now();
  logger.info("🚀 Starting PubSubHubbub subscription details request", {
    prefix: "PubSubHubbub",
  });

  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = searchParams.get("hub.callback");
    const topicUrl = searchParams.get("hub.topic");
    const secret = searchParams.get("hub.secret");

    logger.info("📝 Query parameters", {
      prefix: "PubSubHubbub",
      data: {
        callbackUrl,
        topicUrl,
        secret: secret ? "✓" : "✗",
      },
    });

    if (!callbackUrl || !topicUrl) {
      logger.warn("⚠️ Missing required parameters", { prefix: "PubSubHubbub" });
      return NextResponse.json(
        { error: "Callback URL and Topic URL are required" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      "hub.callback": callbackUrl,
      "hub.topic": topicUrl,
    });

    if (secret) {
      params.append("hub.secret", secret);
      logger.info("🔒 Added secret to request", { prefix: "PubSubHubbub" });
    }

    logger.info("📤 Sending request to get subscription details...", {
      prefix: "PubSubHubbub",
    });
    const response = await axios.get(
      `https://pubsubhubbub.appspot.com/subscription-details?${params.toString()}`
    );

    const endTime = performance.now();
    logger.info("✅ Successfully retrieved subscription details", {
      prefix: "PubSubHubbub",
      data: {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        details: response.data,
      },
    });

    return NextResponse.json(response.data);
  } catch (error) {
    const endTime = performance.now();
    logger.error("💥 PubSubHubbub details error", {
      prefix: "PubSubHubbub",
      data: {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    if (axios.isAxiosError(error)) {
      logger.error("❌ Detailed error information", {
        prefix: "PubSubHubbub",
        data: {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          headers: error.response?.headers,
        },
      });
    }

    return NextResponse.json(
      {
        error: "Failed to get subscription details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
