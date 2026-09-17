import { DEFAULT_VIDEO_MATCHER_CONFIG } from "./config";
import { ExerciseVideoOption, VideoMatcherConfig, YouTubeVideoDetails } from "./types";
import { YouTubeClient } from "./youtube/client";
import { passesMetricFilters, rankCandidates } from "./youtube/filters";
import { TranscriptFetcher } from "./ai/transcript";
import { SafetyChecker } from "./ai/safetyCheck";

export interface VideoMatcherDependencies {
  youtubeClient: YouTubeClient;
  transcriptFetcher: TranscriptFetcher;
  safetyChecker: SafetyChecker;
  config?: Partial<VideoMatcherConfig>;
}

/**
 * Finds, filters and safety-checks YouTube exercise videos for a given query.
 *
 * Pipeline: whitelist-constrained search (falling back to a global search when
 * fewer than `resultCount` whitelisted hits are found) -> metric filtering
 * (duration/engagement/views) -> ranking -> AI transcript safety check on the
 * top candidates -> top `resultCount` videos that passed the safety check.
 */
export async function matchExerciseVideos(
  query: string,
  deps: VideoMatcherDependencies
): Promise<ExerciseVideoOption[]> {
  const config: VideoMatcherConfig = { ...DEFAULT_VIDEO_MATCHER_CONFIG, ...deps.config };
  const { youtubeClient, transcriptFetcher, safetyChecker } = deps;

  const isWhitelisted = (channelId: string) => config.whitelistedChannelIds.includes(channelId);

  // 1. Whitelist-constrained search, per channel (search.list only accepts one channelId).
  const whitelistedSearchResults = (
    await Promise.all(
      config.whitelistedChannelIds.map((channelId) =>
        youtubeClient.searchVideos(query, { channelId, maxResults: 10 })
      )
    )
  ).flat();

  let videoIds = dedupe(whitelistedSearchResults.map((item) => item.videoId));

  // 2. Fall back to a global search if the whitelist didn't yield enough hits.
  if (videoIds.length < config.resultCount) {
    const globalResults = await youtubeClient.searchVideos(query, { maxResults: 25 });
    videoIds = dedupe([...videoIds, ...globalResults.map((item) => item.videoId)]);
  }

  if (videoIds.length === 0) {
    return [];
  }

  // 3. Fetch metrics for all candidates.
  const details = await youtubeClient.getVideoDetails(videoIds);

  // 4. Apply hard metric filters (duration, engagement ratio, minimum views).
  const filtered = details.filter((video) => passesMetricFilters(video, config));

  // 5. Rank: whitelisted channels first, then closeness to the optimal duration band,
  //    then engagement, then views.
  const ranked = rankCandidates(filtered, config, isWhitelisted);

  // 6. Run the (costly) AI transcript safety check on a bounded pool of top candidates,
  //    stopping once we have enough passing results.
  const pool = ranked.slice(0, config.maxCandidatesForAiCheck);
  const results: ExerciseVideoOption[] = [];

  for (const video of pool) {
    if (results.length >= config.resultCount) break;

    const option = await evaluateCandidate(video, query, isWhitelisted, transcriptFetcher, safetyChecker);
    if (option.aiSafetyCheck.passed) {
      results.push(option);
    }
  }

  return results.slice(0, config.resultCount);
}

async function evaluateCandidate(
  video: YouTubeVideoDetails,
  query: string,
  isWhitelisted: (channelId: string) => boolean,
  transcriptFetcher: TranscriptFetcher,
  safetyChecker: SafetyChecker
): Promise<ExerciseVideoOption> {
  const transcript = await transcriptFetcher.fetchTranscript(video.videoId);
  const aiSafetyCheck = await safetyChecker.check({
    query,
    title: video.title,
    transcript,
  });

  return {
    videoId: video.videoId,
    title: video.title,
    channelTitle: video.channelTitle,
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl,
    isWhitelistedChannel: isWhitelisted(video.channelId),
    aiSafetyCheck,
    embedUrl: `https://www.youtube.com/embed/${video.videoId}`,
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}
