/*
    {
        author: 'BBC News Türkçe',
        uri: 'https://www.youtube.com/channel/UCeMQiXmFNTtN3OHlNJxnnUw',
        title: 'BBC News Türkçe',
        thumbnail: 'https://i4.ytimg.com/vi/_NyfWqMKUKc/hqdefault.jpg',
        viewCount: 61712,
        lastVideoId: '_NyfWqMKUKc',
        lastVideoDate: '2025-01-13T15:00:44+00:00',
        channelId: 'UCeMQiXmFNTtN3OHlNJxnnUw'
      }

*/
export interface ChannelFromXmlFeed {
  author: string;
  uri: string;
  title: string;
  thumbnail: string;
  viewCount: number;
  lastVideoId: string;
  lastVideoDate: string;
  channelId: string;
}

export interface PubSubHubbubSubscriptionRequest {
  callbackUrl: string;
  topicUrl: string;
  mode?: "subscribe" | "unsubscribe";
  verifyToken?: string;
  secret?: string;
  leaseSeconds?: number;
}

export interface PubSubHubbubNotification {
  feed: {
    entry: Array<{
      id: Array<string>;
      title: Array<string>;
      link: Array<string>;
      published: Array<string>;
      updated: Array<string>;
      author: Array<{
        name: Array<string>;
        uri: Array<string>;
      }>;
      "yt:videoId": Array<string>;
      "yt:channelId": Array<string>;
    }>;
  };
}

export interface YouTubeQueueMessage {
  channelId: string;
  videoId: string;
  title: string;
  authorName: string;
  published: string;
  updated: string;
  timestamp?: string;
}

export interface Video {
  id: string;
  title: string;
  url: string;
}

export interface VideoCaption {
  video_id: string;
  transcript: string;
  language: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CaptionData {
  transcript: string;
  language: string;
  title?: string;
  duration: number;
}

export interface PGMQMessage<T> {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string; // visibility timeout
  message: T;
}

export interface Video {
  title: string;
  url: string;
  date: string; // ISO date string
  firstSeen: string; // ISO date string when we first discovered the video
}

export interface User {
  email: string;
  youtube_channels: string[];
  subscription_tier: "free" | "basic" | "pro";
  preferences?: {
    instant_notifications: boolean;
    include_transcript: boolean;
    custom_highlights?: string[];
    // ...other preferences
  };
}

export interface EmailNotification {
  id: string;
  profile_id: string;
  channel_id: string;
  video_id: string;
  title: string;
  email_content: string;
  status: "pending" | "sent" | "failed";
  created_at: string;
  sent_at: string | null;
  profiles: {
    email: string;
  };
}

export interface YouTubeCaptionTrack {
  baseUrl: string;
  name: {
    simpleText: string;
  };
  vssId: string;
  languageCode: string;
  kind: string;
  isTranslatable: boolean;
  trackName: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail: string;
  subscriber_count: number;
  last_video_id: string;
  last_video_date: string;
}

export interface ChannelListItem {
  id: string;
  channelId: string;
  name: string;
  url: string;
  customUrl: string;
  subscriberCount: number;
  lastVideoDate: string;
  thumbnail: string;
  latestVideoId: string;
  avatar: string;
  createdAt: string;
}

export interface ChannelProcessingStatus {
  success: boolean;
  status: "pending" | "completed" | "failed";
  channelId?: string;
  message?: string;
  error?: string;
}

export interface ChannelQueryResult {
  id: string;
  created_at: string;
  youtube_channel: {
    id: string;
    title: string;
    thumbnail: string;
    subscriber_count: number;
    last_video_id: string;
    last_video_date: string;
    custom_url: string;
  };
}

export interface VideoAIContent {
  content: {
    briefSummary?: string;
    keyPoints?: string[];
    // ... can add more AI-generated content types in the future
  };
  model: string;
}

export interface EligibleProfile {
  profile_id: string;
  email: string;
  current_usage: number;
  monthly_limit: number;
}

export type SubscriptionStatus = "active" | "expired" | "cancelled";

export interface Subscription {
  id: string;
  profile_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  usage_count: number;
  start_date: string;
  end_date: string | null;
  plans: {
    monthly_email_limit: number;
  };
}

export enum PlanName {
  Free = "Free",
  Basic = "Basic",
  Pro = "Pro",
}

export type AlertType = "limit_reached" | "approaching_limit";
