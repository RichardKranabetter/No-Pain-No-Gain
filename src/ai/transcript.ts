import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptFetcher {
  fetchTranscript(videoId: string): Promise<string | null>;
}

/** Fetches captions via YouTube's public timedtext endpoint (no API key required). */
export class YoutubeTranscriptFetcher implements TranscriptFetcher {
  async fetchTranscript(videoId: string): Promise<string | null> {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId);
      const text = segments.map((segment) => segment.text).join(" ").trim();
      return text.length > 0 ? text : null;
    } catch {
      // Transcript disabled, unavailable, or the video has no captions.
      return null;
    }
  }
}
