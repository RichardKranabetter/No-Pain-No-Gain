import { YouTubeSearchItem, YouTubeVideoDetails } from "../types";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/** Parses an ISO 8601 duration (e.g. "PT1M30S") into whole seconds. */
export function parseIso8601Duration(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (
    (Number(hours) || 0) * 3600 +
    (Number(minutes) || 0) * 60 +
    (Number(seconds) || 0)
  );
}

export interface YouTubeClient {
  /**
   * Runs youtube.search.list for the given query, optionally constrained to a
   * single channel. Returns up to `maxResults` video/channel id pairs.
   */
  searchVideos(
    query: string,
    options?: { channelId?: string; maxResults?: number }
  ): Promise<YouTubeSearchItem[]>;

  /** Runs youtube.videos.list (snippet, contentDetails, statistics) for the given video ids. */
  getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetails[]>;
}

interface YouTubeSearchListResponse {
  items?: Array<{ id?: { videoId?: string }; snippet?: { channelId?: string } }>;
}

interface YouTubeVideosListResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string; channelId?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string };
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `YouTube API request failed (${response.status} ${response.statusText}): ${body}`
    );
  }
  return response.json() as Promise<T>;
}

/** Production YouTube Data API v3 client, backed by the REST API. */
export class YouTubeDataApiClient implements YouTubeClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("YouTubeDataApiClient requires a YouTube Data API v3 key.");
    }
  }

  async searchVideos(
    query: string,
    options: { channelId?: string; maxResults?: number } = {}
  ): Promise<YouTubeSearchItem[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      q: query,
      part: "snippet",
      type: "video",
      maxResults: String(options.maxResults ?? 25),
      videoEmbeddable: "true",
      relevanceLanguage: "de",
    });
    if (options.channelId) {
      params.set("channelId", options.channelId);
    }

    const data = await fetchJson<YouTubeSearchListResponse>(
      `${YOUTUBE_API_BASE}/search?${params.toString()}`
    );

    return (data.items ?? [])
      .filter((item): item is Required<Pick<typeof item, "id">> & typeof item =>
        Boolean(item.id?.videoId)
      )
      .map((item) => ({
        videoId: item.id!.videoId as string,
        channelId: item.snippet?.channelId ?? "",
      }));
  }

  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetails[]> {
    if (videoIds.length === 0) return [];

    const results: YouTubeVideoDetails[] = [];
    // youtube.videos.list accepts at most 50 ids per request.
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const params = new URLSearchParams({
        key: this.apiKey,
        id: batch.join(","),
        part: "snippet,contentDetails,statistics",
      });

      const data = await fetchJson<YouTubeVideosListResponse>(
        `${YOUTUBE_API_BASE}/videos?${params.toString()}`
      );

      for (const item of data.items ?? []) {
        results.push({
          videoId: item.id,
          title: item.snippet?.title ?? "",
          channelId: item.snippet?.channelId ?? "",
          channelTitle: item.snippet?.channelTitle ?? "",
          thumbnailUrl:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            item.snippet?.thumbnails?.default?.url ??
            "",
          durationSeconds: parseIso8601Duration(item.contentDetails?.duration ?? "PT0S"),
          viewCount: Number(item.statistics?.viewCount ?? 0),
          likeCount: Number(item.statistics?.likeCount ?? 0),
        });
      }
    }
    return results;
  }
}
