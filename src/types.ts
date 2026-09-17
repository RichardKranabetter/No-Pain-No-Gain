export interface AiSafetyCheck {
  passed: boolean;
  /** 0.0 - 1.0 */
  confidenceScore: number;
  summary: string;
  flaggedTerms: string[];
}

export interface ExerciseVideoOption {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSeconds: number;
  thumbnailUrl: string;
  isWhitelistedChannel: boolean;
  aiSafetyCheck: AiSafetyCheck;
  embedUrl: string;
}

export interface YouTubeSearchItem {
  videoId: string;
  channelId: string;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
}

export interface VideoMatcherConfig {
  /** Trusted YouTube channel IDs, e.g. certified physio/CRAFTA channels. */
  whitelistedChannelIds: string[];
  /** Hard filter bounds, in seconds. */
  minDurationSeconds: number;
  maxDurationSeconds: number;
  /** Preferred range used for ranking, in seconds. */
  optimalDurationRange: [number, number];
  minEngagementRatio: number;
  minViewCount: number;
  /** How many candidates survive metric filtering before the (costly) AI check runs. */
  maxCandidatesForAiCheck: number;
  /** Number of results to return. */
  resultCount: number;
}
