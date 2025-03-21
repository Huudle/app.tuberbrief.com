import { YoutubeTranscript } from "youtube-transcript";

export const getTranscript = async (videoId: string): Promise<string> => {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  return transcript.map((t) => t.text).join(" ");
};
