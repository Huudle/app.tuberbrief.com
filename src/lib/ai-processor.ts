import OpenAI from "openai";
import { Video } from "@/lib/types";

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
    console.log(`[Summarizer] Generating summary for video: ${video.title}`);
    console.log(`[Summarizer] Using language: ${language}`);
    console.log(`[Summarizer] Transcript length: ${transcript.length} chars`);

    if (!process.env.OPENAI_API_KEY) {
      console.log(
        "[Summarizer] No OpenAI API key found, skipping summary generation"
      );
      return null;
    }

    const prompt = `
Please analyze this YouTube video transcript and provide:
1. A concise summary (2-3 sentences)
2. Key points or takeaways (3-5 bullet points)

Important: 
- Provide the response in ${language === "tr" ? "Turkish" : "English"} language
- Format your response strictly as a JSON object with these exact fields:
  {
    "briefSummary": "your summary here",
    "keyPoints": ["point 1", "point 2", "point 3"]
  }

Transcript:
${transcript}
`;

    console.log(`[Summarizer] Using ${language} for output`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a skilled content analyzer. Provide concise, informative summaries in ${
            language === "tr" ? "Turkish" : "English"
          } language. Always format your response as a valid JSON object.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    console.log("[Summarizer] OpenAI response:", content);
    if (!content) {
      console.error("[Summarizer] No content in OpenAI response");
      return null;
    }

    try {
      const cleanedContent = content
        .trim()
        .replace(/^```json\n/, "") // Remove opening ```json
        .replace(/\n```$/, ""); // Remove closing ```
      const summary = JSON.parse(cleanedContent) as Summary;
      console.log("[Summarizer] Summary generated successfully");
      return summary;
    } catch (parseError) {
      console.error(
        "[Summarizer] Error parsing GPT response as JSON:",
        parseError
      );
      console.error("[Summarizer] Raw response:", content);
      return null;
    }
  } catch (error) {
    console.error("[Summarizer] Error generating summary:", error);
    throw error;
  }
};
