import OpenAI from "openai";
import { Video } from "@/lib/types";
import { logger } from "@/lib/logger";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface Summary {
  keyPoints: string[];
  briefSummary: string;
}

export const generateVideoSummary = async (
  video: Video,
  transcript: string,
  language: string = "en"
): Promise<Summary | null> => {
  try {
    logger.info("🤖 Generating summary for video", {
      prefix: "AI",
      data: {
        title: video.title,
        language,
        transcriptLength: transcript.length,
      },
    });

    if (!process.env.OPENAI_API_KEY) {
      logger.warn("🔑 No OpenAI API key found, skipping summary generation", {
        prefix: "AI",
      });
      return null;
    }

    // Handle empty transcript case
    if (!transcript) {
      logger.warn("📝 Empty transcript provided", {
        prefix: "AI",
        data: { videoId: video.id },
      });
      return {
        briefSummary: "No transcript available for this video.",
        keyPoints: ["Transcript unavailable", "Cannot generate summary"],
      };
    }

    // Handle empty or unknown language
    if (!language) {
      logger.warn("🌐 No language specified, defaulting to English", {
        prefix: "AI",
        data: { videoId: video.id },
      });
      language = "en";
    }

    const prompt = `
Please analyze this YouTube video transcript and provide:
1. A concise summary (2-3 sentences)
2. Key points or takeaways (3-5 bullet points)

Important: 
- Provide the response in "${language}" language
- Format your response strictly as a JSON object with these exact fields:
  {
    "briefSummary": "your summary here",
    "keyPoints": ["point 1", "point 2", "point 3"]
  }
${
  transcript.length < 50
    ? `
Note: This transcript appears to be very short or incomplete. Please include this limitation in your summary.
`
    : ""
}

Transcript:
${transcript || "No transcript available"}
`;

    logger.debug("🌐 Using language for output", {
      prefix: "AI",
      data: { language },
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a skilled content analyzer. Provide concise, informative summaries in "${language}" language. Always format your response as a valid JSON object. If the transcript is missing or very short, acknowledge this limitation in your summary.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    logger.debug("📝 OpenAI response received", {
      prefix: "AI",
      data: { content },
    });

    if (!content) {
      logger.error("❌ No content in OpenAI response", {
        prefix: "AI",
        data: { response },
      });
      return null;
    }

    try {
      const cleanedContent = content
        .trim()
        .replace(/^```json\n/, "") // Remove opening ```json
        .replace(/\n```$/, ""); // Remove closing ```
      const summary = JSON.parse(cleanedContent) as Summary;
      logger.info("✅ Summary generated successfully", {
        prefix: "AI",
        data: {
          summaryLength: summary.briefSummary.length,
          pointsCount: summary.keyPoints.length,
        },
      });
      return summary;
    } catch (parseError) {
      logger.error("🚨 Error parsing GPT response as JSON", {
        prefix: "AI",
        data: {
          error:
            parseError instanceof Error ? parseError.message : "Unknown error",
          rawContent: content,
        },
      });
      return null;
    }
  } catch (error) {
    logger.error("💥 Error generating summary", {
      prefix: "AI",
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
        videoTitle: video.title,
      },
    });
    throw error;
  }
};
