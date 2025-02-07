interface TranscriptResponse {
  content: string | TranscriptSegment[];
  lang: string;
  availableLangs: string[];
  error?: string;
  message?: string;
}

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}

export interface TranscriptOptions {
  lang?: string;
  text?: boolean;
  chunkSize?: number;
}

/**
 * Get transcript from a YouTube video using Supadata API
 * @param videoId YouTube video ID
 * @param options Optional parameters for transcript
 * @returns Transcript response with content and language info
 */
export const getTranscript = async (
  videoId: string,
  options: TranscriptOptions = { text: true }
): Promise<TranscriptResponse> => {
  const params = new URLSearchParams({
    videoId,
    ...(options.lang && { lang: options.lang }),
    ...(options.text !== undefined && { text: options.text.toString() }),
    ...(options.chunkSize && { chunkSize: options.chunkSize.toString() }),
  });

  const response = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?${params}`,
    {
      method: "GET",
      headers: {
        "x-api-key": process.env.SUPADATA_API_KEY || "",
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to fetch transcript: ${error.message}`);
  }

  return response.json();
};

/**
 * Get plain text transcript from a YouTube video
 * @param videoId YouTube video ID
 * @param lang Optional preferred language code
 * @returns Plain text transcript
 */
export const getPlainTextTranscript = async (
  videoId: string,
  lang?: string
): Promise<string> => {
  const response = await getTranscript(videoId, { text: true, lang });
  return response.content as string;
};

/**
 * Get segmented transcript with timing information
 * @param videoId YouTube video ID
 * @param options Optional parameters for transcript
 * @returns Transcript segments with timing info
 */
export const getSegmentedTranscript = async (
  videoId: string,
  options: Omit<TranscriptOptions, "text"> = {}
): Promise<TranscriptSegment[]> => {
  const response = await getTranscript(videoId, { ...options, text: false });
  return response.content as TranscriptSegment[];
};

/**
 * Get available languages for a video's transcripts
 * @param videoId YouTube video ID
 * @returns List of available language codes
 */
export const getAvailableLanguages = async (
  videoId: string
): Promise<string[]> => {
  const response = await getTranscript(videoId);
  return response.availableLangs;
};

// Example with url
// getTranscript("https://www.youtube.com/watch?v=dcbg-zITD00", { lang: "en" });

// Example with videoId
// getTranscript("dcbg-zITD00", { lang: "en", text: true });

// Example 003
// getTranscript("dcbg-zITD00", { lang: "en", text: false });
