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
