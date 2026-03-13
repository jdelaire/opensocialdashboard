import { Page } from "playwright";
import { parseFollowerCount } from "../extract/normalize.js";
import { CollectConfidence, CollectMethod, CollectResult } from "../types.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const COMPACT_SUFFIX_PATTERN = "(?:[kKmMbB千萬万亿億]|\\\\u5343|\\\\u4e07|\\\\u842c|\\\\u4ebf|\\\\u5104)";
const COUNT_PATTERN = `[0-9][0-9\\s,._]*(?:${COMPACT_SUFFIX_PATTERN})?`;
const NON_EXACT_TAIL_PATTERN = "(?:[+~≈＞>]|[kKmMbB千萬万亿億]|\\\\u5343|\\\\u4e07|\\\\u842c|\\\\u4ebf|\\\\u5104)";

export interface Candidate {
  followers: number;
  confidence: CollectConfidence;
  raw_excerpt: string;
}

export function success(method: CollectMethod, candidate: Candidate): CollectResult {
  return {
    followers: candidate.followers,
    method,
    confidence: candidate.confidence,
    status: "ok",
    raw_excerpt: candidate.raw_excerpt.slice(0, 200)
  };
}

export function failed(
  method: CollectMethod,
  error_code: string,
  error_message: string,
  raw_excerpt?: string
): CollectResult {
  const result: CollectResult = {
    followers: null,
    method,
    confidence: "low",
    status: "failed",
    error_code,
    error_message
  };
  if (raw_excerpt) {
    result.raw_excerpt = raw_excerpt.slice(0, 200);
  }
  return result;
}

export async function fetchHtml(url: string): Promise<string> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10_000);

  try {
    const response = await fetch(url, {
      signal: abort.signal,
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "en-US,en;q=0.9"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractFromMeta(html: string, keywords: string[], confidence: CollectConfidence): Candidate | null {
  const metaTagPattern = /<meta[^>]*>/gi;
  const tagMatches = html.match(metaTagPattern) || [];

  for (const tag of tagMatches) {
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (!contentMatch) {
      continue;
    }

    const content = contentMatch[1];
    if (!content) {
      continue;
    }
    const candidate = extractCountNearKeywords(content, keywords, confidence);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function extractFromJsonKeys(
  html: string,
  keys: string[],
  confidence: CollectConfidence
): Candidate | null {
  for (const key of keys) {
    const keyRegex = new RegExp(
      `\\"${escapeRegex(key)}\\"\\s*:\\s*\\"?(${COUNT_PATTERN})(?!\\s*${NON_EXACT_TAIL_PATTERN})`,
      "i"
    );
    const match = html.match(keyRegex);
    if (!match) {
      continue;
    }

    const rawValue = match[1];
    if (!rawValue) {
      continue;
    }
    const parsed = parseFollowerCount(rawValue);
    if (parsed !== null) {
      return {
        followers: parsed,
        confidence,
        raw_excerpt: `${key}: ${rawValue}`
      };
    }
  }

  return null;
}

export function extractCountNearKeywords(
  text: string,
  keywords: string[],
  confidence: CollectConfidence
): Candidate | null {
  for (const keyword of keywords) {
    const escaped = escapeRegex(keyword);
    const numberFirst = new RegExp(
      `(${COUNT_PATTERN})(?!\\s*${NON_EXACT_TAIL_PATTERN})\\s*(?:${escaped})`,
      "i"
    );
    const keywordFirst = new RegExp(
      `(?:${escaped})\\s*[:\\-]?\\s*(${COUNT_PATTERN})(?!\\s*${NON_EXACT_TAIL_PATTERN})`,
      "i"
    );

    const matchA = text.match(numberFirst);
    if (matchA) {
      const rawValue = matchA[1];
      const excerpt = matchA[0];
      if (!rawValue || !excerpt) {
        continue;
      }
      const parsed = parseFollowerCount(rawValue);
      if (parsed !== null) {
        return {
          followers: parsed,
          confidence,
          raw_excerpt: excerpt
        };
      }
    }

    const matchB = text.match(keywordFirst);
    if (matchB) {
      const rawValue = matchB[1];
      const excerpt = matchB[0];
      if (!rawValue || !excerpt) {
        continue;
      }
      const parsed = parseFollowerCount(rawValue);
      if (parsed !== null) {
        return {
          followers: parsed,
          confidence,
          raw_excerpt: excerpt
        };
      }
    }
  }

  return null;
}

export async function extractFromSelectors(
  page: Page,
  selectors: string[],
  keywords: string[],
  confidence: CollectConfidence
): Promise<Candidate | null> {
  for (const selector of selectors) {
    try {
      const text = await page.locator(selector).first().innerText({ timeout: 2_500 });
      if (!text) {
        continue;
      }

      const direct = parseFollowerCount(text);
      if (direct !== null) {
        return {
          followers: direct,
          confidence,
          raw_excerpt: text
        };
      }

      const nearby = extractCountNearKeywords(text, keywords, confidence);
      if (nearby) {
        return nearby;
      }
    } catch {
      // Fallback to next selector.
    }
  }

  return null;
}
