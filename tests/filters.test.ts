import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_MATCHER_CONFIG } from "../src/config";
import {
  durationPenalty,
  passesDurationCheck,
  passesEngagementCheck,
  passesMetricFilters,
  passesMinViewsCheck,
  rankCandidates,
} from "../src/youtube/filters";
import { YouTubeVideoDetails } from "../src/types";

function makeVideo(overrides: Partial<YouTubeVideoDetails> = {}): YouTubeVideoDetails {
  return {
    videoId: "v1",
    title: "Kieferöffnung Übung",
    channelId: "channel-1",
    channelTitle: "Physio Channel",
    thumbnailUrl: "https://example.com/thumb.jpg",
    durationSeconds: 90,
    viewCount: 5000,
    likeCount: 100,
    ...overrides,
  };
}

describe("duration filter", () => {
  it("rejects shorts under 30s", () => {
    expect(passesDurationCheck(makeVideo({ durationSeconds: 15 }), DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });

  it("rejects videos over 5 minutes", () => {
    expect(passesDurationCheck(makeVideo({ durationSeconds: 400 }), DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });

  it("accepts videos within 30s-5min", () => {
    expect(passesDurationCheck(makeVideo({ durationSeconds: 200 }), DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(true);
  });
});

describe("engagement filter", () => {
  it("rejects videos with likeCount/viewCount below 0.01", () => {
    const video = makeVideo({ viewCount: 100000, likeCount: 50 });
    expect(passesEngagementCheck(video, DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });

  it("accepts videos at or above the ratio threshold", () => {
    const video = makeVideo({ viewCount: 10000, likeCount: 100 });
    expect(passesEngagementCheck(video, DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(true);
  });

  it("rejects videos with zero views", () => {
    const video = makeVideo({ viewCount: 0, likeCount: 0 });
    expect(passesEngagementCheck(video, DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });
});

describe("minimum views filter", () => {
  it("rejects videos with 1000 views or fewer", () => {
    expect(passesMinViewsCheck(makeVideo({ viewCount: 1000 }), DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });

  it("accepts videos with more than 1000 views", () => {
    expect(passesMinViewsCheck(makeVideo({ viewCount: 1001 }), DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(true);
  });
});

describe("passesMetricFilters", () => {
  it("requires all three checks to pass", () => {
    const good = makeVideo();
    expect(passesMetricFilters(good, DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(true);

    const badDuration = makeVideo({ durationSeconds: 20 });
    expect(passesMetricFilters(badDuration, DEFAULT_VIDEO_MATCHER_CONFIG)).toBe(false);
  });
});

describe("durationPenalty", () => {
  it("is zero inside the optimal band", () => {
    expect(durationPenalty(100, [45, 180])).toBe(0);
  });

  it("grows below the band", () => {
    expect(durationPenalty(30, [45, 180])).toBe(15);
  });

  it("grows above the band", () => {
    expect(durationPenalty(200, [45, 180])).toBe(20);
  });
});

describe("rankCandidates", () => {
  it("puts whitelisted channels first", () => {
    const nonWhitelisted = makeVideo({ videoId: "a", channelId: "unknown", durationSeconds: 90 });
    const whitelisted = makeVideo({ videoId: "b", channelId: "trusted", durationSeconds: 250 });

    const ranked = rankCandidates(
      [nonWhitelisted, whitelisted],
      DEFAULT_VIDEO_MATCHER_CONFIG,
      (channelId) => channelId === "trusted"
    );

    expect(ranked[0].videoId).toBe("b");
  });

  it("prefers videos closer to the optimal duration band when whitelist status ties", () => {
    const far = makeVideo({ videoId: "far", durationSeconds: 290 });
    const close = makeVideo({ videoId: "close", durationSeconds: 100 });

    const ranked = rankCandidates([far, close], DEFAULT_VIDEO_MATCHER_CONFIG, () => false);

    expect(ranked[0].videoId).toBe("close");
  });
});
