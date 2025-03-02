# TuberBrief

## YouTube Channel Monitoring & Summarization Service

This web application monitors YouTube channels, fetches new video metadata and captions, generates summaries using AI, and sends the summaries to users via email.

## Features
- **Channel Monitoring**: Users can add YouTube channels to monitor.
- **Video Detection**: Periodically checks for new videos on the subscribed channels.
- **AI Summarization**: Generates summaries for new videos by fetching captions or subtitles.
- **Email Notifications**: Sends video summaries to users via email.
- **Scalable Infrastructure**: Supports high user volumes with parallel processing, distributed workers, and auto-scaling.

## Architecture Overview

The application follows an event-driven, distributed architecture to ensure efficiency and scalability.

### Components:
- **Frontend**:
  - User authentication and management.
  - Channel subscription and preferences.
  - Dashboard for user activity and settings.

- **Backend**:
  - Periodic job scheduler (Cron jobs or serverless functions) to monitor channels.
  - Message queues for task distribution.
  - Worker nodes for parallel processing of video checks, caption fetching, and summarization.
  - Summarization service using AI models.
  - Email service for sending personalized summaries.

- **Database**:
  - PostgreSQL for storing user data, channel subscriptions, and video metadata.
  - Redis or Memcached for caching frequently checked channels and metadata.

- **External Services**:
  - YouTube Data API for fetching channel and video metadata.
  - YouTube Captions API or scraping for fetching captions/subtitles.
  - AI Summarization Service.
  - Email service.
