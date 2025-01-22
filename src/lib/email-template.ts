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
}

export function generateEmailTemplate({
  videoTitle,
  channelName,
  publishedAt,
  videoId,
  captions,
  summary,
  upgradeCTA = "",
}: EmailTemplateParams): string {
  const videoUrl = `https://youtube.com/watch?v=${videoId}`;
  const publishDate = new Date(publishedAt).toLocaleString();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Video from ${channelName}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      line-height: 1.6; 
      max-width: 600px; 
      margin: 0 auto; 
      padding: 20px; 
      color: #1a1a1a;
    }
    .video-title { 
      color: #1a1a1a; 
      font-size: 24px; 
      margin-bottom: 20px; 
      font-weight: bold;
    }
    .video-date { 
      color: #666; 
      margin: 20px 0; 
      font-size: 12px; 
    }
    .key-point { 
      margin-bottom: 10px; 
    }
    .transcript {
      margin-top: 30px;
      padding-top: 20px;
    }
    .upgrade-cta {
      margin-top: 30px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <h1 class="video-title">${videoTitle}</h1>
  <p class="video-date">${publishDate}</p>
  
  ${
    summary
      ? `
  <div>
    <p>${summary.briefSummary}</p>
    ${
      summary.keyPoints
        ? `
    <div>
      ${summary.keyPoints
        .map(
          (point) => `
        <p class="key-point">• ${point}</p>
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
    captions
      ? `
  <div class="transcript">
    <p>${captions}</p>
  </div>
  `
      : ""
  }

  👉 Watch the video: <a href="${videoUrl}">${videoUrl}</a>

  ${
    upgradeCTA
      ? `
  <div class="upgrade-cta">
    ${upgradeCTA}
  </div>
  `
      : ""
  }
</body>
</html>
  `.trim();
}
