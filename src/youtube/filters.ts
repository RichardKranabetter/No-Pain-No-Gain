import { VideoMatcherConfig, YouTubeVideoDetails } from "../types";

export function passesDurationCheck(
  video: YouTubeVideoDetails,
  config: VideoMatcherConfig
): boolean {
  return (
    video.durationSeconds >= config.minDurationSeconds &&
    video.durationSeconds <= config.maxDurationSeconds
  );
}

export function passesEngagementCheck(
  video: YouTubeVideoDetails,
  config: VideoMatcherConfig
): boolean {
  if (video.viewCount <= 0) return false;
  return video.likeCount / video.viewCount >= config.minEngagementRatio;
}

export function passesMinViewsCheck(
  video: YouTubeVideoDetails,
  config: VideoMatcherConfig
): boolean {
  return video.viewCount > config.minViewCount;
}

export function passesMetricFilters(
  video: YouTubeVideoDetails,
  config: VideoMatcherConfig
): boolean {
  return (
    passesDurationCheck(video, config) &&
    passesEngagementCheck(video, config) &&
    passesMinViewsCheck(video, config)
  );
}

/** Distance from the optimal duration band; 0 means inside the band. */
export function durationPenalty(
  durationSeconds: number,
  [optimalMin, optimalMax]: [number, number]
): number {
  if (durationSeconds < optimalMin) return optimalMin - durationSeconds;
  if (durationSeconds > optimalMax) return durationSeconds - optimalMax;
  return 0;
}

/**
 * Ranks filtered candidates: whitelisted channels first, then closeness to the
 * optimal duration band, then engagement ratio, then raw view count.
 */
export function rankCandidates(
  videos: YouTubeVideoDetails[],
  config: VideoMatcherConfig,
  isWhitelisted: (channelId: string) => boolean
): YouTubeVideoDetails[] {
  return [...videos].sort((a, b) => {
    const whitelistedA = isWhitelisted(a.channelId) ? 1 : 0;
    const whitelistedB = isWhitelisted(b.channelId) ? 1 : 0;
    if (whitelistedA !== whitelistedB) return whitelistedB - whitelistedA;

    const durationPenaltyA = durationPenalty(a.durationSeconds, config.optimalDurationRange);
    const durationPenaltyB = durationPenalty(b.durationSeconds, config.optimalDurationRange);
    if (durationPenaltyA !== durationPenaltyB) return durationPenaltyA - durationPenaltyB;

    const engagementA = a.viewCount > 0 ? a.likeCount / a.viewCount : 0;
    const engagementB = b.viewCount > 0 ? b.likeCount / b.viewCount : 0;
    if (engagementA !== engagementB) return engagementB - engagementA;

    return b.viewCount - a.viewCount;
  });
}
