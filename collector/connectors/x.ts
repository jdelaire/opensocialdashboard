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

const KEYWORDS = ["followers", "follower"];

function withEnglishLocale(inputUrl: string): string {
  const url = new URL(inputUrl);
  url.searchParams.set("lang", "en");
  return url.toString();
}

export const xConnector: Connector = {
  supports(url: string): boolean {
    return /(x\.com|twitter\.com)/i.test(url);
  },

  async collectViaHtml(url: string): Promise<CollectResult> {
    try {
      const localizedUrl = withEnglishLocale(url);
      const html = await fetchHtml(localizedUrl);
      if (detectBlockOrCaptcha(html)) {
        return failed("html", "captcha", "Captcha or bot challenge detected in HTML response.");
      }

      const fromMeta = extractFromMeta(html, KEYWORDS, "high");
      if (fromMeta) {
        return success("html", fromMeta);
      }

      const fromJson = extractFromJsonKeys(html, ["followers_count", "followersCount"], "medium");
      if (fromJson) {
        return success("html", fromJson);
      }

      const rawFollowersMatch = html.match(/([0-9][0-9.,\s]*[kKmMbB]?)\s+Followers\b/i);
      const rawFollowersText = rawFollowersMatch?.[0];
      if (rawFollowersText) {
        const parsed = parseFollowerCount(rawFollowersText);
        if (parsed !== null) {
          return success("html", {
            followers: parsed,
            confidence: "medium",
            raw_excerpt: rawFollowersText
          });
        }
      }

      const plain = htmlToText(html);
      const fromText = extractCountNearKeywords(plain, KEYWORDS, "low");
      if (fromText) {
        return success("html", fromText);
      }

      return failed("html", "extract_failed", "Unable to extract X followers from HTML.");
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
      const localizedUrl = withEnglishLocale(url);
      await page.goto(localizedUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(1_500);

      const [bodyText, html] = await Promise.all([
        page.locator("body").innerText().catch(() => ""),
        page.content()
      ]);

      if (detectBlockOrCaptcha(`${bodyText}\n${html}`)) {
        return failed("playwright", "captcha", "Captcha or bot challenge detected in browser response.");
      }

      const fromSelectors = await extractFromSelectors(
        page,
        [
          "a[href$='/followers'] span",
          "a[href$='/verified_followers'] span",
          "[data-testid='UserProfileHeader_Items'] a span"
        ],
        KEYWORDS,
        "high"
      );
      if (fromSelectors) {
        return success("playwright", fromSelectors);
      }

      const rawFollowersMatch = bodyText.match(/([0-9][0-9.,\s]*[kKmMbB]?)\s+Followers\b/i);
      const rawFollowersText = rawFollowersMatch?.[0];
      if (rawFollowersText) {
        const parsed = parseFollowerCount(rawFollowersText);
        if (parsed !== null) {
          return success("playwright", {
            followers: parsed,
            confidence: "high",
            raw_excerpt: rawFollowersText
          });
        }
      }

      const fromText = extractCountNearKeywords(bodyText, KEYWORDS, "medium");
      if (fromText) {
        return success("playwright", fromText);
      }

      const fromJson = extractFromJsonKeys(html, ["followers_count", "followersCount"], "low");
      if (fromJson) {
        return success("playwright", fromJson);
      }

      return failed("playwright", "extract_failed", "Unable to extract X followers via Playwright.");
    } catch (error) {
      return failed(
        "playwright",
        "playwright_navigation_failed",
        error instanceof Error ? error.message : "Unknown Playwright error"
      );
    }
  }
};
