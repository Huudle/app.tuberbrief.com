import axios from "axios";
import { NextResponse } from "next/server";

const PUBSUBHUBBUB_HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

export async function POST(request: Request) {
  const startTime = performance.now();
  console.log("🔔 Starting PubSubHubbub subscription request");

  try {
    const body = await request.json();
    const { callbackUrl, topicUrl, mode = "subscribe" } = body;
    console.log("📝 Request body:", {
      callbackUrl,
      topicUrl,
      mode,
      verifyToken: body.verifyToken ? "✓" : "✗",
      secret: body.secret ? "✓" : "✗",
      leaseSeconds: body.leaseSeconds,
    });

    if (!callbackUrl || !topicUrl) {
      console.log("❌ Missing required parameters");
      return NextResponse.json(
        { error: "Callback URL and Topic URL are required" },
        { status: 400 }
      );
    }

    // Validate mode
    if (mode !== "subscribe" && mode !== "unsubscribe") {
      console.log("❌ Invalid mode:", mode);
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
      console.log("🔑 Added verify token to request");
    }
    if (body.secret) {
      formData.append("hub.secret", body.secret);
      console.log("🔒 Added secret to request");
    }
    if (body.leaseSeconds) {
      formData.append("hub.lease_seconds", body.leaseSeconds.toString());
      console.log("⏱️ Added lease seconds:", body.leaseSeconds);
    }

    console.log("📤 Sending request to PubSubHubbub hub...");
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

    console.log("🔍 Response status:", response.status);
    console.log("🔍 Response headers:", response.headers);
    console.log("🔍 Response data:", response.data || "No content");

    const endTime = performance.now();
    console.log("✅ Subscription request successful");
    console.log(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`
    );

    // If we get here, the subscription request was successful
    return NextResponse.json({
      success: true,
      message: `${mode} request submitted successfully`,
    });
  } catch (error) {
    const endTime = performance.now();
    console.error("💥 PubSubHubbub subscription error:", error);
    console.error(
      "Request failed after:",
      (endTime - startTime).toFixed(2),
      "ms"
    );

    if (axios.isAxiosError(error)) {
      console.error("🔍 Detailed error information:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
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
  console.log("🔍 Starting PubSubHubbub subscription details request");

  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = searchParams.get("hub.callback");
    const topicUrl = searchParams.get("hub.topic");
    const secret = searchParams.get("hub.secret");

    console.log("📝 Query parameters:", {
      callbackUrl,
      topicUrl,
      secret: secret ? "✓" : "✗",
    });

    if (!callbackUrl || !topicUrl) {
      console.log("❌ Missing required parameters");
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
      console.log("🔒 Added secret to request");
    }

    console.log("📤 Sending request to get subscription details...");
    const response = await axios.get(
      `https://pubsubhubbub.appspot.com/subscription-details?${params.toString()}`
    );

    const endTime = performance.now();
    console.log("✅ Successfully retrieved subscription details");
    console.log(
      `⏱️ Request completed in ${(endTime - startTime).toFixed(2)}ms`
    );
    console.log("📊 Subscription details:", response.data);

    return NextResponse.json(response.data);
  } catch (error) {
    const endTime = performance.now();
    console.error("💥 PubSubHubbub details error:", error);
    console.error(
      "Request failed after:",
      (endTime - startTime).toFixed(2),
      "ms"
    );

    if (axios.isAxiosError(error)) {
      console.error("🔍 Detailed error information:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
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
