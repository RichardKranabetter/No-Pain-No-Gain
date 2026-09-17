# No-Pain-No-Gain — YouTube Video Matching Engine

Backend module that finds, filters, and safety-checks YouTube exercise videos
for a physiotherapy patient app (CMD/CRAFTA therapy focus), so therapists get
ranked video suggestions instead of plain text plans.

## Setup

```bash
npm install
cp .env.example .env   # fill in YOUTUBE_API_KEY, ANTHROPIC_API_KEY, whitelist
```

## Usage

```ts
import { findExerciseVideos } from "./src";

const videos = await findExerciseVideos("Kieferöffnung CMD");
```

`findExerciseVideos` reads `YOUTUBE_API_KEY` and `ANTHROPIC_API_KEY` from the
environment and wires up the production YouTube Data API v3 client, the
`youtube-transcript` caption fetcher, and a Claude-based safety checker.

For testing, or to swap in different providers, call `matchExerciseVideos`
directly with your own `YouTubeClient` / `TranscriptFetcher` / `SafetyChecker`
implementations (see `tests/videoMatcher.test.ts`).

## Pipeline (`src/videoMatcher.ts`)

1. **Whitelist-constrained search** — `youtube.search.list` per whitelisted
   channel ID (`src/config.ts` → `YOUTUBE_WHITELISTED_CHANNEL_IDS`). Falls
   back to a global search only if fewer than `resultCount` (default 3)
   whitelisted videos are found.
2. **Metric filtering** (`src/youtube/filters.ts`) via `youtube.videos.list`
   (`snippet,contentDetails,statistics`):
   - Duration: 30s–300s hard bounds (excludes Shorts and long-form videos);
     45s–180s is the optimal band used for ranking.
   - Engagement: `likeCount / viewCount >= 0.01`.
   - Minimum views: `viewCount > 1000`.
3. **Ranking** — whitelisted channels first, then closeness to the optimal
   duration band, then engagement ratio, then view count.
4. **AI transcript safety check** (`src/ai/`) on the top-ranked candidates:
   - Transcript fetched via `youtube-transcript`.
   - A local keyword scan flags clickbait phrases (`src/config.ts` →
     `NEGATIVE_KEYWORDS`, e.g. "Wundermittel", "Sofort geheilt").
   - Claude verifies anatomical relevance to the query, flags unsafe/clickbait
     claims, and writes a 2-sentence execution summary for the therapist.
   - Videos without an available transcript are excluded (cannot be verified).
5. Returns the top `resultCount` (default 3) videos that passed the safety
   check, shaped as `ExerciseVideoOption[]` (see `src/types.ts`).

## Configuration

`VideoMatcherConfig` (`src/types.ts`, defaults in `src/config.ts`) controls
all thresholds — duration bounds, engagement ratio, minimum views, the
optimal duration band, how many candidates get the (costlier) AI check, and
the number of results returned. Pass overrides via
`findExerciseVideos(query, { minViewCount: 500 })` or the `config` field of
`VideoMatcherDependencies`.

## Testing

```bash
npm test         # run once
npm run test:watch
npm run build     # type-check + emit to dist/
```

Tests mock the YouTube/transcript/AI dependencies, so no API keys are needed
to run the suite.
