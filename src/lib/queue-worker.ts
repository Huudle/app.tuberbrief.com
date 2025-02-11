import {
  supabaseServicePGMQPublic,
  supabaseServicePublic,
  getStoredAIContent,
  storeAIContent,
} from "@/lib/supabase";
import { YouTubeQueueMessage, PGMQMessage, Video } from "@/lib/types";
import { fetchCaptions } from "@/lib/captions";
import { generateEmailTemplate } from "@/lib/email-template";
import { generateVideoSummary } from "@/lib/ai-processor";
import { managePubSubHubbub } from "@/lib/pubsub";
import { logger } from "@/lib/logger";

const QUEUE_NAME = "youtube_data_queue";
const POLLING_INTERVAL = 5000;
export class QueueWorker {
  public isRunning: boolean = false;
  private supabasePGMQ = supabaseServicePGMQPublic(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
  private supabasePublic = supabaseServicePublic;

  async start() {
    this.isRunning = true;
    logger.info("🎬 Starting queue worker", { prefix: "Queue" });

    while (this.isRunning) {
      try {
        await this.processNextMessage();
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      } catch (error) {
        logger.error("💥 Queue worker error", {
          prefix: "Queue",
          data: {
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
    }
  }

  stop() {
    this.isRunning = false;
    logger.info("🛑 Stopping queue worker", { prefix: "Queue" });
  }

  private async processNextMessage() {
    let queueMessage: PGMQMessage<YouTubeQueueMessage> | null = null;
    try {
      logger.info("🔍 Popping message from queue", { prefix: "Queue" });

      const { data: messages, error: popError } = await this.supabasePGMQ.rpc(
        "pop",
        { queue_name: QUEUE_NAME }
      );

      if (popError) {
        throw new Error(`Queue pop error: ${popError.message}`);
      }
      if (!messages || messages.length === 0) {
        return;
      }

      queueMessage = messages[0] as PGMQMessage<YouTubeQueueMessage>;
      const message = queueMessage.message;

      logger.info("📦 Processing message", {
        prefix: "Queue",
        data: {
          msgId: queueMessage.msg_id,
          readCount: queueMessage.read_ct,
          enqueuedAt: queueMessage.enqueued_at,
          videoId: message.videoId,
          channelId: message.channelId,
          authorName: message.authorName,
          title: message.title,
          published: message.published,
        },
      });

      const deleteMessage = async () => {
        logger.info("🔍 Deleting message from queue", {
          prefix: "Queue",
          data: { msgId: queueMessage?.msg_id },
        });
        await this.supabasePGMQ.rpc("delete", {
          queue_name: QUEUE_NAME,
          msg_id: queueMessage?.msg_id,
        });
      };

      logger.debug("🔍 Checking if channel is subscribed", {
        prefix: "Queue",
        data: { channelId: message.channelId },
      });

      const { data: channelData } = await this.supabasePublic
        .from("profile_youtube_channels")
        .select("profile_id")
        .eq("youtube_channel_id", message.channelId);

      if (channelData?.length === 0) {
        logger.info("ℹ️ Skipping processing - channel not subscribed", {
          prefix: "Queue",
          data: { channelId: message.channelId },
        });
        await deleteMessage();

        logger.info("🔍 Unsubscribing from channel", {
          prefix: "Queue",
          data: { channelId: message.channelId },
        });
        await managePubSubHubbub({
          channelId: message.channelId,
          mode: "unsubscribe",
        });
        return;
      }

      // Check if any subscribers are within their plan limits
      const { data: eligibleProfiles } = await this.supabasePublic.rpc(
        "get_eligible_notification_profiles",
        { channel_id_param: message.channelId }
      );

      logger.info("Checking eligible profiles", {
        prefix: "Queue",
        data: {
          total: channelData?.length ?? 0,
          eligible: eligibleProfiles?.length ?? 0,
        },
      });

      if (!eligibleProfiles || eligibleProfiles.length === 0) {
        logger.info("No eligible profiles found - all subscribers at limit", {
          prefix: "Queue",
          data: { channelId: message.channelId },
        });
        await deleteMessage();
        return;
      }

      // Continue with video processing since we have eligible subscribers
      logger.info("Found eligible profiles, continuing processing", {
        prefix: "Queue",
        data: {
          eligibleCount: eligibleProfiles.length,
          videoId: message.videoId,
        },
      });

      if (!message.videoId || !message.channelId) {
        logger.warn("🔍 Skipping processing - missing videoId or channelId", {
          prefix: "Queue",
          data: { videoId: message.videoId, channelId: message.channelId },
        });
        await deleteMessage();
        return;
      }

      logger.info("🚀 Starting processing", {
        prefix: "Queue",
        data: { timestamp: new Date().toISOString() },
      });

      const captions = await fetchCaptions(message.videoId, message.title);
      logger.debug("🔍 Captions fetched", {
        prefix: "Queue",
        data: { videoId: message.videoId, hasCaptions: !!captions },
      });

      if (!captions) {
        logger.info("🔍 Skipping processing - no captions available", {
          prefix: "Queue",
          data: { videoId: message.videoId },
        });
        await deleteMessage();
        return;
      }

      // Check for existing AI content
      const aiContent = await getStoredAIContent(message.videoId);
      let summary;

      if (!aiContent) {
        // Generate new AI content only if not exists
        const aiSummary = await generateVideoSummary(
          {
            id: message.videoId,
            title: message.title,
            url: `https://youtube.com/watch?v=${message.videoId}`,
          } as Video,
          captions.transcript,
          captions.language
        );

        if (aiSummary) {
          // Store the new AI content
          await storeAIContent(message.videoId, {
            content: {
              briefSummary: aiSummary.briefSummary,
              keyPoints: aiSummary.keyPoints,
            },
            model: "gpt-4o-mini", // Get from AI processor
          });
          summary = aiSummary;
        }
      } else {
        summary = aiContent.content;
      }

      // Generate email content with AI content
      const emailContent = generateEmailTemplate({
        videoTitle: message.title,
        channelName: message.authorName,
        publishedAt: message.published,
        videoId: message.videoId,
        captions,
        summary: summary
          ? {
              briefSummary: summary.briefSummary,
              keyPoints: summary.keyPoints,
            }
          : undefined,
        upgradeCTA: "Want more features? Upgrade your plan!",
        showTranscript: false,
        showUpgradeCTA: false,
      });

      // Get subscribers for this channel
      const { data: subscribers } = await this.supabasePublic
        .from("profile_youtube_channels")
        .select("profile_id")
        .eq("youtube_channel_id", message.channelId);
      if (!subscribers) {
        logger.info("🔍 No subscribers found for channel", {
          prefix: "Queue",
          data: { channelId: message.channelId },
        });
        return;
      }
      // Log the subscribers
      logger.info("👥 Subscribers", {
        prefix: "Queue",
        data: { total: subscribers.length },
      });
      // Check existing notifications
      const { data: existingNotifications } = await this.supabasePublic
        .from("email_notifications")
        .select("profile_id")
        .eq("video_id", message.videoId)
        .in(
          "profile_id",
          subscribers.map((s) => s.profile_id)
        );
      // Filter out subscribers who already have notifications
      const existingProfileIds = new Set(
        existingNotifications?.map((n) => n.profile_id) || []
      );
      logger.info("🔍 Existing profile IDs", {
        prefix: "Queue",
        data: { total: existingProfileIds.size },
      });
      const newSubscribers = subscribers.filter(
        (sub) => !existingProfileIds.has(sub.profile_id)
      );
      if (newSubscribers.length === 0) {
        logger.info("🔍 All subscribers already notified", {
          prefix: "Queue",
          data: { channelId: message.channelId },
        });
        return;
      }
      // When creating notifications, only create for eligible profiles
      const eligibleProfileIds = new Set(
        eligibleProfiles.map((p) => p.profile_id)
      );
      const notifications = newSubscribers
        .filter((sub) => eligibleProfileIds.has(sub.profile_id))
        .map((sub) => ({
          profile_id: sub.profile_id,
          channel_id: message.channelId,
          video_id: message.videoId,
          title: message.title,
          email_content: emailContent.replace(/\n/g, ""),
          status: "pending",
          created_at: new Date().toISOString(),
        }));
      logger.info("📧 Creating notifications", {
        prefix: "Queue",
        data: {
          total: subscribers.length,
          new: newSubscribers.length,
          existing: existingProfileIds.size,
        },
      });
      const { error: notificationError } = await this.supabasePublic
        .from("email_notifications")
        .insert(notifications);
      if (notificationError) {
        logger.error("❌ Failed to save notifications", {
          prefix: "Queue",
          data: {
            error:
              notificationError instanceof Error
                ? notificationError.message
                : "Unknown error",
          },
        });
        throw notificationError;
      }
      logger.info("✅ Successfully processed video", {
        prefix: "Queue",
        data: { videoId: message.videoId },
      });
    } catch (error) {
      logger.error("💥 Error processing message", {
        prefix: "Queue",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          messageId: queueMessage?.msg_id,
          videoId: queueMessage?.message.videoId,
        },
      });

      if (queueMessage) {
        const { error: requeueError } = await this.supabasePGMQ.rpc("send", {
          queue_name: QUEUE_NAME,
          message: queueMessage.message,
        });

        if (requeueError) {
          logger.error("❌ Failed to re-queue message", {
            prefix: "Queue",
            data: {
              error: requeueError,
              messageId: queueMessage.msg_id,
            },
          });
        } else {
          logger.info("♻️ Message re-queued successfully", {
            prefix: "Queue",
            data: { messageId: queueMessage.msg_id },
          });
        }
      }
    }
  }
}
