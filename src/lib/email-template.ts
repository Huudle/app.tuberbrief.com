interface EmailTemplateParams {
  videoTitle: string;
  channelName: string;
  publishedAt: string;
  videoId: string;
  captions: string;
  summary?: {
    briefSummary?: string;
    keyPoints?: string[];
  };
  upgradeCTA?: string;
  showTranscript?: boolean;
  showUpgradeCTA?: boolean;
}

export function generateEmailTemplate({
  videoTitle,
  channelName,
  publishedAt,
  videoId,
  captions,
  summary,
  upgradeCTA = "",
  showTranscript = false,
  showUpgradeCTA = false,
}: EmailTemplateParams): string {
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;
  const publishDate = new Date(publishedAt).toLocaleString();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Video from ${channelName}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0; padding: 20px;">
  <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px; font-weight: bold;">${videoTitle}</h1>
  <p style="color: #666666; font-size: 12px; margin: 20px 0;">${publishDate}</p>
  
  ${
    summary
      ? `
  <div style="margin: 35px 0; padding: 0;">
    <p style="margin: 0 0 20px 0;">${summary.briefSummary}</p>
    ${
      summary.keyPoints
        ? `
    <div style="margin: 35px 0; padding: 0;">
      ${summary.keyPoints
        .map(
          (point) => `
        <p>• ${point}</p>
      `
        )
        .join("")}
    </div>
    `
        : ""
    }
  </div>
  `
      : ""
  }

  ${
    showTranscript && captions
      ? `
  <div style="margin: 35px 0; padding: 0;">
    <p style="margin: 0;">${captions}</p>
  </div>
  `
      : ""
  }

  <div style="margin: 35px 0; padding: 0;">
    <p style="margin: 0;">👉 Watch the video: <a href="${videoUrl}" style="color: #0066cc;">${videoUrl}</a></p>
  </div>

  ${
    showUpgradeCTA && upgradeCTA
      ? `
  <div style="margin: 35px 0; padding: 20px; background-color: #f8f9fa;">
    ${upgradeCTA}
  </div>
  `
      : ""
  }
</body>
</html>
  `.trim();
}
