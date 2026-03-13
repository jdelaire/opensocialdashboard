import { readFileSync } from "node:fs";
import path from "node:path";
import { AccountConfig } from "./types.js";

const VALID_PLATFORMS = new Set(["instagram", "tiktok", "rednote", "youtube", "x"]);

export function loadAccountsConfig(configPath = path.resolve("config/accounts.json")): AccountConfig[] {
  const raw = readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("config/accounts.json must contain an array");
  }

  return parsed.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Account at index ${index} must be an object`);
    }

    const candidate = item as Record<string, unknown>;
    const id = candidate.id;
    const platform = candidate.platform;
    const label = candidate.label;
    const url = candidate.url;
    const enabled = candidate.enabled;

    if (typeof id !== "string" || !id.trim()) {
      throw new Error(`Account at index ${index} has invalid id`);
    }
    if (typeof label !== "string" || !label.trim()) {
      throw new Error(`Account ${id} has invalid label`);
    }
    if (typeof url !== "string" || !url.startsWith("http")) {
      throw new Error(`Account ${id} has invalid url`);
    }
    if (typeof platform !== "string" || !VALID_PLATFORMS.has(platform)) {
      throw new Error(`Account ${id} has invalid platform`);
    }
    if (typeof enabled !== "boolean") {
      throw new Error(`Account ${id} has invalid enabled`);
    }

    return {
      id,
      platform: platform as AccountConfig["platform"],
      label,
      url,
      enabled
    };
  });
}
