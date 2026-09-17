import { VideoMatcherConfig } from "./types";

/**
 * Trusted channel IDs (certified physio / CRAFTA / CMD therapy channels).
 * Extend this list as therapists vet and approve additional sources.
 */
export const WHITELISTED_CHANNEL_IDS: string[] = (
  process.env.YOUTUBE_WHITELISTED_CHANNEL_IDS ?? ""
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const DEFAULT_VIDEO_MATCHER_CONFIG: VideoMatcherConfig = {
  whitelistedChannelIds: WHITELISTED_CHANNEL_IDS,
  minDurationSeconds: 30,
  maxDurationSeconds: 300,
  optimalDurationRange: [45, 180],
  minEngagementRatio: 0.01,
  minViewCount: 1000,
  maxCandidatesForAiCheck: 10,
  resultCount: 3,
};

export const NEGATIVE_KEYWORDS: string[] = [
  "wundermittel",
  "sofort geheilt",
  "in 2 minuten schmerzfrei",
  "in 5 minuten schmerzfrei",
  "wunderheilung",
  "geheimtrick",
  "einzige methode",
  "100% heilung",
];
