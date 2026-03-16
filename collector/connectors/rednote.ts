import { Page } from "playwright";
import { detectBlockOrCaptcha } from "../extract/blockDetect.js";
import { parseFollowerCount } from "../extract/normalize.js";
import { CollectResult, Connector } from "../types.js";
import {
  Candidate,
  extractCountNearKeywords,
  extractFromJsonKeys,
  extractFromSelectors,
  failed,
  fetchHtml,
  htmlToText,
  success
} from "./base.js";

const KEYWORDS = ["followers", "follower", "fans", "粉丝"];

function parseLowerBoundFollowerCount(rawInput: string): number | null {
  const match = rawInput
    .replace(/[＋﹢]/g, "+")
    .match(/([0-9][0-9\s,._]*)(?:\s*([kKmMbB千萬万亿億]))?\s*\+/);

  if (!match) {
    return null;
  }

  const valuePart = match[1]?.replace(/_/g, "").trim();
  if (!valuePart) {
    return null;
  }

  return parseFollowerCount(`${valuePart}${match[2] ?? ""}`);
}

function candidateFromRawCount(rawCount: string, confidence: Candidate["confidence"], rawExcerpt: string): Candidate | null {
  const exact = parseFollowerCount(rawCount);
  if (exact !== null) {
    return {
      followers: exact,
      confidence,
      raw_excerpt: rawExcerpt,
      measurement_kind: "exact"
    };
  }

  const lowerBound = parseLowerBoundFollowerCount(rawCount);
  if (lowerBound !== null) {
    return {
      followers: lowerBound,
      confidence,
      raw_excerpt: rawExcerpt,
      measurement_kind: "lower_bound"
    };
  }

  return null;
}

function extractCountNearKeywordsWithMeasurement(
  text: string,
  confidence: Candidate["confidence"]
): Candidate | null {
  for (const keyword of KEYWORDS) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`([0-9][0-9\\s,._]*(?:[kKmMbB千萬万亿億])?\\s*[+＋﹢]?)\\s*(?:位)?\\s*(?:${escaped})`, "i"),
      new RegExp(`(?:${escaped})\\s*[:\\-]?\\s*([0-9][0-9\\s,._]*(?:[kKmMbB千萬万亿億])?\\s*[+＋﹢]?)`, "i")
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const rawValue = match?.[1];
      const excerpt = match?.[0];
      if (!rawValue || !excerpt) {
        continue;
      }

      const candidate = candidateFromRawCount(rawValue, confidence, excerpt);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

function extractFromMetaWithMeasurement(html: string, confidence: Candidate["confidence"]): Candidate | null {
  const metaTagPattern = /<meta[^>]*>/gi;
  const tagMatches = html.match(metaTagPattern) || [];

  for (const tag of tagMatches) {
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    const content = contentMatch?.[1];
    if (!content) {
      continue;
    }

    const candidate = extractCountNearKeywordsWithMeasurement(content, confidence);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractFromInitialStateInteractions(html: string) {
  const fansMatch = html.match(/"type":"fans"[^}]*"count":"([^"]+)"/i)
    ?? html.match(/"name":"粉丝"[^}]*"count":"([^"]+)"/i);

  const rawCount = fansMatch?.[1];
  if (!rawCount) {
    return null;
  }

  return candidateFromRawCount(rawCount, "high", `fans: ${rawCount}`);
}

export const rednoteConnector: Connector = {
  supports(url: string): boolean {
    return /(xiaohongshu\.com|xhslink\.com|rednote)/i.test(url);
  },

  async collectViaHtml(url: string): Promise<CollectResult> {
    try {
      const html = await fetchHtml(url);
      if (detectBlockOrCaptcha(html)) {
        return failed("html", "captcha", "Captcha or bot challenge detected in HTML response.");
      }

      const fromInitialState = extractFromInitialStateInteractions(html);
      if (fromInitialState) {
        return success("html", fromInitialState);
      }

      const fromMeta = extractFromMetaWithMeasurement(html, "high");
      if (fromMeta) {
        return success("html", fromMeta);
      }

      const fromJson = extractFromJsonKeys(html, ["followerCount", "fans", "followedCount"], "medium");
      if (fromJson) {
        return success("html", fromJson);
      }

      const plain = htmlToText(html);
      const fromText = extractCountNearKeywordsWithMeasurement(plain, "low")
        ?? extractCountNearKeywords(plain, KEYWORDS, "low");
      if (fromText) {
        return success("html", fromText);
      }

      return failed("html", "extract_failed", "Unable to extract RedNote followers from HTML.");
    } catch (error) {
      return failed(
        "html",
        "fetch_failed",
        error instanceof Error ? error.message : "Unknown HTML fetch error"
      );
    }
  },

  async collectViaPlaywright(url: string, page: Page): Promise<CollectResult> {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(1_500);

      const [title, bodyText, html] = await Promise.all([
        page.title().catch(() => ""),
        page.locator("body").innerText().catch(() => ""),
        page.content()
      ]);
      const finalUrl = page.url();

      if (detectBlockOrCaptcha(`${finalUrl}\n${title}\n${bodyText}\n${html}`)) {
        return failed(
          "playwright",
          "captcha",
          "Captcha, security restriction, or bot challenge detected in browser response."
        );
      }

      const fromInitialState = extractFromInitialStateInteractions(html);
      if (fromInitialState) {
        return success("playwright", fromInitialState);
      }

      const fromSelectors = await extractFromSelectors(
        page,
        [
          "[class*='follower']",
          "[class*='fans']",
          "main strong"
        ],
        KEYWORDS,
        "high"
      );
      if (fromSelectors) {
        return success("playwright", fromSelectors);
      }

      const fromText = extractCountNearKeywords(bodyText, KEYWORDS, "medium");
      const fromMeasuredText = extractCountNearKeywordsWithMeasurement(bodyText, "medium") ?? fromText;
      if (fromMeasuredText) {
        return success("playwright", fromMeasuredText);
      }

      const fromJson = extractFromJsonKeys(html, ["followerCount", "fans", "followedCount"], "low");
      if (fromJson) {
        return success("playwright", fromJson);
      }

      return failed("playwright", "extract_failed", "Unable to extract RedNote followers via Playwright.");
    } catch (error) {
      return failed(
        "playwright",
        "playwright_navigation_failed",
        error instanceof Error ? error.message : "Unknown Playwright error"
      );
    }
  }
};
