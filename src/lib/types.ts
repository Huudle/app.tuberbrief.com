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
