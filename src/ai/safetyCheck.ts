import Anthropic from "@anthropic-ai/sdk";
import { AiSafetyCheck } from "../types";
import { NEGATIVE_KEYWORDS } from "../config";

export interface SafetyCheckInput {
  query: string;
  title: string;
  transcript: string | null;
}

export interface SafetyChecker {
  check(input: SafetyCheckInput): Promise<AiSafetyCheck>;
}

/** Case-insensitive scan for known clickbait/red-flag phrases. */
export function findNegativeKeywords(text: string): string[] {
  const lowerText = text.toLowerCase();
  return NEGATIVE_KEYWORDS.filter((keyword) => lowerText.includes(keyword.toLowerCase()));
}

const SYSTEM_PROMPT = `You are a clinical safety reviewer for a physiotherapy patient app (focus: CMD/CRAFTA therapy).
You review the transcript of a YouTube exercise video before it is shown to a therapist as a suggestion.

Given an exercise query and a video transcript, respond with ONLY a JSON object (no prose, no markdown fences) matching:
{
  "anatomicallyRelevant": boolean,   // does the transcript actually describe/demonstrate the exercise concept asked for?
  "hasClickbaitOrUnsafeClaims": boolean, // e.g. "miracle cure", "instantly healed", exaggerated/unsafe medical claims
  "flaggedTerms": string[],          // exact phrases from the transcript that triggered the clickbait/unsafe flag, if any
  "confidenceScore": number,         // 0.0-1.0, your confidence in this overall assessment
  "summary": string                  // concise 2-sentence summary of the video's exercise execution, for a therapist
}`;

/** Production safety checker backed by the Claude API. */
export class ClaudeSafetyChecker implements SafetyChecker {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = "claude-sonnet-5"
  ) {
    if (!apiKey) {
      throw new Error("ClaudeSafetyChecker requires an Anthropic API key.");
    }
    this.client = new Anthropic({ apiKey });
  }

  async check(input: SafetyCheckInput): Promise<AiSafetyCheck> {
    const localFlags = findNegativeKeywords(`${input.title} ${input.transcript ?? ""}`);

    if (!input.transcript) {
      return {
        passed: false,
        confidenceScore: 0,
        summary: "No transcript/captions available for this video, so its content could not be verified.",
        flaggedTerms: localFlags,
      };
    }

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Exercise query: "${input.query}"\nVideo title: "${input.title}"\nTranscript:\n"""\n${input.transcript.slice(0, 12000)}\n"""`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";

    let parsed: {
      anatomicallyRelevant?: boolean;
      hasClickbaitOrUnsafeClaims?: boolean;
      flaggedTerms?: string[];
      confidenceScore?: number;
      summary?: string;
    };
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      return {
        passed: false,
        confidenceScore: 0,
        summary: "AI safety check failed: could not parse model response.",
        flaggedTerms: localFlags,
      };
    }

    const flaggedTerms = Array.from(
      new Set([...(parsed.flaggedTerms ?? []), ...localFlags])
    );
    const passed =
      Boolean(parsed.anatomicallyRelevant) &&
      !parsed.hasClickbaitOrUnsafeClaims &&
      localFlags.length === 0;

    return {
      passed,
      confidenceScore: clamp01(parsed.confidenceScore ?? 0),
      summary: parsed.summary ?? "",
      flaggedTerms,
    };
  }
}

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
