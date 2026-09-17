import { matchExerciseVideos, VideoMatcherDependencies } from "./videoMatcher";
import { YouTubeDataApiClient } from "./youtube/client";
import { YoutubeTranscriptFetcher } from "./ai/transcript";
import { ClaudeSafetyChecker } from "./ai/safetyCheck";
import { ExerciseVideoOption, VideoMatcherConfig } from "./types";

export * from "./types";
export { matchExerciseVideos, VideoMatcherDependencies } from "./videoMatcher";
export { YouTubeClient, YouTubeDataApiClient, parseIso8601Duration } from "./youtube/client";
export { TranscriptFetcher, YoutubeTranscriptFetcher } from "./ai/transcript";
export { SafetyChecker, ClaudeSafetyChecker, findNegativeKeywords } from "./ai/safetyCheck";
export { DEFAULT_VIDEO_MATCHER_CONFIG, WHITELISTED_CHANNEL_IDS, NEGATIVE_KEYWORDS } from "./config";

/**
 * Convenience entry point wired to the production YouTube + Claude clients.
 * Reads YOUTUBE_API_KEY and ANTHROPIC_API_KEY from the environment.
 */
export async function findExerciseVideos(
  query: string,
  config?: Partial<VideoMatcherConfig>
): Promise<ExerciseVideoOption[]> {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!youtubeApiKey) throw new Error("Missing YOUTUBE_API_KEY environment variable.");
  if (!anthropicApiKey) throw new Error("Missing ANTHROPIC_API_KEY environment variable.");

  const deps: VideoMatcherDependencies = {
    youtubeClient: new YouTubeDataApiClient(youtubeApiKey),
    transcriptFetcher: new YoutubeTranscriptFetcher(),
    safetyChecker: new ClaudeSafetyChecker(anthropicApiKey),
    config,
  };

  return matchExerciseVideos(query, deps);
}
