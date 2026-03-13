import { Page } from "playwright";
import { detectBlockOrCaptcha } from "../extract/blockDetect.js";
import { parseFollowerCount } from "../extract/normalize.js";
import { CollectResult, Connector } from "../types.js";
import {
  extractCountNearKeywords,
  extractFromJsonKeys,
  extractFromMeta,
  extractFromSelectors,
  failed,
  fetchHtml,
  htmlToText,
  success
} from "./base.js";

const KEYWORDS = ["followers", "follower", "fans", "粉丝"];

function extractFromInitialStateInteractions(html: string) {
  const fansMatch = html.match(/"type":"fans"[^}]*"count":"([^"]+)"/i)
    ?? html.match(/"name":"粉丝"[^}]*"count":"([^"]+)"/i);

  const rawCount = fansMatch?.[1];
  if (!rawCount) {
    return null;
  }

  const parsed = parseFollowerCount(rawCount);
  if (parsed === null) {
    return null;
  }

  return {
    followers: parsed,
    confidence: "high" as const,
    raw_excerpt: `fans: ${rawCount}`
  };
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

      const fromMeta = extractFromMeta(html, KEYWORDS, "high");
      if (fromMeta) {
        return success("html", fromMeta);
      }

      const fromJson = extractFromJsonKeys(html, ["followerCount", "fans", "followedCount"], "medium");
      if (fromJson) {
        return success("html", fromJson);
      }

      const plain = htmlToText(html);
      const fromText = extractCountNearKeywords(plain, KEYWORDS, "low");
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
      if (fromText) {
        return success("playwright", fromText);
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
