import { describe, expect, it, vi } from "vitest";
import { matchExerciseVideos } from "../src/videoMatcher";
import { YouTubeClient } from "../src/youtube/client";
import { TranscriptFetcher } from "../src/ai/transcript";
import { SafetyChecker } from "../src/ai/safetyCheck";
import { YouTubeVideoDetails } from "../src/types";

function makeDetail(overrides: Partial<YouTubeVideoDetails>): YouTubeVideoDetails {
  return {
    videoId: "id",
    title: "Kieferöffnung CMD Übung",
    channelId: "unknown",
    channelTitle: "Some Channel",
    thumbnailUrl: "https://example.com/thumb.jpg",
    durationSeconds: 90,
    viewCount: 5000,
    likeCount: 100,
    ...overrides,
  };
}

const WHITELISTED_CHANNEL = "UC_trusted_physio";

describe("matchExerciseVideos", () => {
  it("prefers whitelisted-channel search results and only falls back to global search when needed", async () => {
    const searchVideos = vi
      .fn<YouTubeClient["searchVideos"]>()
      .mockImplementation(async (_query, options) => {
        if (options?.channelId === WHITELISTED_CHANNEL) {
          return [
            { videoId: "w1", channelId: WHITELISTED_CHANNEL },
            { videoId: "w2", channelId: WHITELISTED_CHANNEL },
            { videoId: "w3", channelId: WHITELISTED_CHANNEL },
          ];
        }
        return [{ videoId: "g1", channelId: "unknown" }];
      });

    const getVideoDetails = vi.fn<YouTubeClient["getVideoDetails"]>().mockResolvedValue([
      makeDetail({ videoId: "w1", channelId: WHITELISTED_CHANNEL }),
      makeDetail({ videoId: "w2", channelId: WHITELISTED_CHANNEL }),
      makeDetail({ videoId: "w3", channelId: WHITELISTED_CHANNEL }),
    ]);

    const youtubeClient: YouTubeClient = { searchVideos, getVideoDetails };
    const transcriptFetcher: TranscriptFetcher = {
      fetchTranscript: vi.fn().mockResolvedValue("Sanfte Kieferöffnung, langsam wiederholen."),
    };
    const safetyChecker: SafetyChecker = {
      check: vi.fn().mockResolvedValue({
        passed: true,
        confidenceScore: 0.9,
        summary: "Zwei Sätze Zusammenfassung.",
        flaggedTerms: [],
      }),
    };

    const results = await matchExerciseVideos("Kieferöffnung CMD", {
      youtubeClient,
      transcriptFetcher,
      safetyChecker,
      config: { whitelistedChannelIds: [WHITELISTED_CHANNEL] },
    });

    // 3 whitelisted results already satisfy resultCount, so no global fallback search.
    expect(searchVideos).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.isWhitelistedChannel)).toBe(true);
  });

  it("falls back to global search when fewer than resultCount whitelisted videos are found", async () => {
    const searchVideos = vi
      .fn<YouTubeClient["searchVideos"]>()
      .mockImplementation(async (_query, options) => {
        if (options?.channelId === WHITELISTED_CHANNEL) {
          return [{ videoId: "w1", channelId: WHITELISTED_CHANNEL }];
        }
        return [
          { videoId: "g1", channelId: "unknown" },
          { videoId: "g2", channelId: "unknown" },
        ];
      });

    const getVideoDetails = vi.fn<YouTubeClient["getVideoDetails"]>().mockResolvedValue([
      makeDetail({ videoId: "w1", channelId: WHITELISTED_CHANNEL }),
      makeDetail({ videoId: "g1", channelId: "unknown" }),
      makeDetail({ videoId: "g2", channelId: "unknown" }),
    ]);

    const youtubeClient: YouTubeClient = { searchVideos, getVideoDetails };
    const transcriptFetcher: TranscriptFetcher = {
      fetchTranscript: vi.fn().mockResolvedValue("Transcript text mentioning Kieferöffnung."),
    };
    const safetyChecker: SafetyChecker = {
      check: vi.fn().mockResolvedValue({
        passed: true,
        confidenceScore: 0.8,
        summary: "Summary.",
        flaggedTerms: [],
      }),
    };

    const results = await matchExerciseVideos("Kieferöffnung CMD", {
      youtubeClient,
      transcriptFetcher,
      safetyChecker,
      config: { whitelistedChannelIds: [WHITELISTED_CHANNEL] },
    });

    expect(searchVideos).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.videoId).sort()).toEqual(["g1", "g2", "w1"]);
  });

  it("excludes videos that fail metric filters", async () => {
    const youtubeClient: YouTubeClient = {
      searchVideos: vi.fn().mockResolvedValue([{ videoId: "short", channelId: "unknown" }]),
      getVideoDetails: vi
        .fn()
        .mockResolvedValue([makeDetail({ videoId: "short", durationSeconds: 5 })]),
    };
    const transcriptFetcher: TranscriptFetcher = { fetchTranscript: vi.fn() };
    const safetyChecker: SafetyChecker = { check: vi.fn() };

    const results = await matchExerciseVideos("Kieferöffnung CMD", {
      youtubeClient,
      transcriptFetcher,
      safetyChecker,
      config: { whitelistedChannelIds: [] },
    });

    expect(results).toEqual([]);
    expect(transcriptFetcher.fetchTranscript).not.toHaveBeenCalled();
    expect(safetyChecker.check).not.toHaveBeenCalled();
  });

  it("excludes videos that fail the AI safety check", async () => {
    const youtubeClient: YouTubeClient = {
      searchVideos: vi.fn().mockResolvedValue([{ videoId: "clickbait", channelId: "unknown" }]),
      getVideoDetails: vi.fn().mockResolvedValue([makeDetail({ videoId: "clickbait" })]),
    };
    const transcriptFetcher: TranscriptFetcher = {
      fetchTranscript: vi.fn().mockResolvedValue("In 2 Minuten schmerzfrei mit diesem Wundermittel!"),
    };
    const safetyChecker: SafetyChecker = {
      check: vi.fn().mockResolvedValue({
        passed: false,
        confidenceScore: 0.95,
        summary: "Contains unsafe clickbait claims.",
        flaggedTerms: ["wundermittel", "in 2 minuten schmerzfrei"],
      }),
    };

    const results = await matchExerciseVideos("Kieferöffnung CMD", {
      youtubeClient,
      transcriptFetcher,
      safetyChecker,
      config: { whitelistedChannelIds: [] },
    });

    expect(results).toEqual([]);
  });

  it("caps results at resultCount", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    const youtubeClient: YouTubeClient = {
      searchVideos: vi.fn().mockResolvedValue(ids.map((id) => ({ videoId: id, channelId: "unknown" }))),
      getVideoDetails: vi.fn().mockResolvedValue(ids.map((id) => makeDetail({ videoId: id }))),
    };
    const transcriptFetcher: TranscriptFetcher = {
      fetchTranscript: vi.fn().mockResolvedValue("Kieferöffnung Übung Transkript."),
    };
    const safetyChecker: SafetyChecker = {
      check: vi.fn().mockResolvedValue({
        passed: true,
        confidenceScore: 0.9,
        summary: "Summary.",
        flaggedTerms: [],
      }),
    };

    const results = await matchExerciseVideos("Kieferöffnung CMD", {
      youtubeClient,
      transcriptFetcher,
      safetyChecker,
      config: { whitelistedChannelIds: [], resultCount: 3 },
    });

    expect(results).toHaveLength(3);
  });
});
