import { Page } from "playwright";
import { detectBlockOrCaptcha } from "../extract/blockDetect.js";
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

export const tiktokConnector: Connector = {
  supports(url: string): boolean {
    return /tiktok\.com/i.test(url);
  },

  async collectViaHtml(url: string): Promise<CollectResult> {
    try {
      const html = await fetchHtml(url);
      if (detectBlockOrCaptcha(html)) {
        return failed("html", "captcha", "Captcha or bot challenge detected in HTML response.");
      }

      const fromMeta = extractFromMeta(html, KEYWORDS, "high");
      if (fromMeta) {
        return success("html", fromMeta);
      }

      const fromJson = extractFromJsonKeys(html, ["followerCount", "fans", "stats"], "medium");
      if (fromJson) {
        return success("html", fromJson);
      }

      const plain = htmlToText(html);
      const fromText = extractCountNearKeywords(plain, KEYWORDS, "low");
      if (fromText) {
        return success("html", fromText);
      }

      return failed("html", "extract_failed", "Unable to extract TikTok followers from HTML.");
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
          "strong[data-e2e='followers-count']",
          "strong[data-e2e='followers']",
          "div[data-e2e='user-stats'] strong"
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

      const fromJson = extractFromJsonKeys(html, ["followerCount", "fans"], "low");
      if (fromJson) {
        return success("playwright", fromJson);
      }

      return failed("playwright", "extract_failed", "Unable to extract TikTok followers via Playwright.");
    } catch (error) {
      return failed(
        "playwright",
        "playwright_navigation_failed",
        error instanceof Error ? error.message : "Unknown Playwright error"
      );
    }
  }
};
