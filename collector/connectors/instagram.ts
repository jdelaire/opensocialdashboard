import { Page } from "playwright";
import { detectBlockOrCaptcha } from "../extract/blockDetect.js";
import { parseFollowerCount } from "../extract/normalize.js";
import { CollectResult, Connector } from "../types.js";
import {
  Candidate,
  extractCountNearKeywords,
  extractFromJsonKeys,
  extractFromMeta,
  failed,
  fetchHtml,
  htmlToText,
  success
} from "./base.js";

const KEYWORDS = ["followers", "follower"];

function detectInstagramLoginWall(input: string): boolean {
  const text = input.toLowerCase();
  return (
    (text.includes("log into instagram") &&
      text.includes("mobile number, username or email") &&
      text.includes("password")) ||
    (text.includes("see everyday moments from your close friends") && text.includes("create new account"))
  );
}

async function extractInstagramFollowersFromPage(page: Page): Promise<Candidate | null> {
  const selectorPlans = [
    { selector: "a[href$='/followers/']", allowDirect: true },
    { selector: "a[href*='/followers']", allowDirect: true },
    { selector: "header section ul li", allowDirect: false },
    { selector: "header li", allowDirect: false }
  ];

  for (const plan of selectorPlans) {
    try {
      const locator = page.locator(plan.selector);
      const count = Math.min(await locator.count(), 8);

      for (let index = 0; index < count; index += 1) {
        const text = await locator.nth(index).innerText({ timeout: 2_500 }).catch(() => "");
        if (!text) {
          continue;
        }

        const nearby = extractCountNearKeywords(text, KEYWORDS, "high");
        if (nearby) {
          return nearby;
        }

        if (!plan.allowDirect) {
          continue;
        }

        const direct = parseFollowerCount(text);
        if (direct !== null) {
          return {
            followers: direct,
            confidence: "high",
            raw_excerpt: text
          };
        }
      }
    } catch {
      // Fallback to the next selector plan.
    }
  }

  return null;
}

async function collectInstagramPageSnapshot(page: Page): Promise<{ bodyText: string; html: string }> {
  const [bodyText, html] = await Promise.all([
    page.locator("body").innerText().catch(() => ""),
    page.content()
  ]);

  return { bodyText, html };
}

async function extractInstagramFollowersWithSnapshot(
  page: Page,
  bodyText: string,
  html: string
): Promise<CollectResult> {
  if (detectBlockOrCaptcha(`${bodyText}\n${html}`)) {
    return failed("playwright", "captcha", "Captcha or bot challenge detected in browser response.");
  }

  if (detectInstagramLoginWall(bodyText)) {
    return failed(
      "playwright",
      "auth_required",
      "Instagram served a login wall instead of the public profile. Use an authenticated profile or retry from a different network.",
      bodyText
    );
  }

  const fromSelectors = await extractInstagramFollowersFromPage(page);
  if (fromSelectors) {
    return success("playwright", fromSelectors);
  }

  const fromText = extractCountNearKeywords(bodyText, KEYWORDS, "medium");
  if (fromText) {
    return success("playwright", fromText);
  }

  const fromJson = extractFromJsonKeys(html, ["edge_followed_by", "follower_count"], "low");
  if (fromJson) {
    return success("playwright", fromJson);
  }

  return failed(
    "playwright",
    "extract_failed",
    "Unable to extract Instagram followers via Playwright.",
    bodyText || html
  );
}

export const instagramConnector: Connector = {
  supports(url: string): boolean {
    return /instagram\.com/i.test(url);
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

      const fromJson = extractFromJsonKeys(html, ["edge_followed_by", "follower_count"], "medium");
      if (fromJson) {
        return success("html", fromJson);
      }

      const plain = htmlToText(html);
      const fromText = extractCountNearKeywords(plain, KEYWORDS, "low");
      if (fromText) {
        return success("html", fromText);
      }

      return failed("html", "extract_failed", "Unable to extract Instagram followers from HTML.");
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
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      await page.locator("header").first().waitFor({ timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(1_500);

      const firstSnapshot = await collectInstagramPageSnapshot(page);
      const firstPass = await extractInstagramFollowersWithSnapshot(
        page,
        firstSnapshot.bodyText,
        firstSnapshot.html
      );
      if (firstPass.status === "ok" || firstPass.error_code === "captcha") {
        return firstPass;
      }

      await page.evaluate(() => window.scrollTo(0, Math.min(window.innerHeight, document.body.scrollHeight / 3))).catch(
        () => undefined
      );
      await page.waitForTimeout(2_500);

      const secondSnapshot = await collectInstagramPageSnapshot(page);
      return extractInstagramFollowersWithSnapshot(page, secondSnapshot.bodyText, secondSnapshot.html);
    } catch (error) {
      return failed(
        "playwright",
        "playwright_navigation_failed",
        error instanceof Error ? error.message : "Unknown Playwright error"
      );
    }
  }
};
