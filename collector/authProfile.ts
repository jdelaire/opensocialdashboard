import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { AccountConfig } from "./types.js";

const LOCAL_AUTH_PROFILE_ROOT = path.resolve("data/playwright-profiles");
const COPY_SKIP_NAMES = new Set(["LOCK", "SingletonLock", "SingletonSocket", "SingletonCookie"]);

function sanitizeAccountId(accountId: string): string {
  return accountId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function hasAuthProfileSource(account: AccountConfig): boolean {
  return typeof account.auth_profile_source_path === "string" && account.auth_profile_source_path.trim().length > 0;
}

export function getLocalAuthProfilePath(account: AccountConfig): string {
  return path.join(LOCAL_AUTH_PROFILE_ROOT, sanitizeAccountId(account.id));
}

export function ensureLocalAuthProfile(account: AccountConfig): string {
  const configuredSource = account.auth_profile_source_path?.trim();
  if (!configuredSource) {
    throw new Error(`Account ${account.id} does not define auth_profile_source_path`);
  }

  const localProfilePath = getLocalAuthProfilePath(account);
  if (existsSync(localProfilePath)) {
    return localProfilePath;
  }

  const resolvedSourcePath = path.resolve(configuredSource);
  const sourceStats = statSync(resolvedSourcePath, { throwIfNoEntry: false });
  if (!sourceStats?.isDirectory()) {
    throw new Error(`Auth profile source path does not exist or is not a directory: ${resolvedSourcePath}`);
  }

  mkdirSync(LOCAL_AUTH_PROFILE_ROOT, { recursive: true });

  const tempProfilePath = `${localProfilePath}.tmp-${Date.now()}`;
  rmSync(tempProfilePath, { recursive: true, force: true });

  try {
    cpSync(resolvedSourcePath, tempProfilePath, {
      recursive: true,
      force: true,
      filter: (sourcePath) => !COPY_SKIP_NAMES.has(path.basename(sourcePath))
    });
    renameSync(tempProfilePath, localProfilePath);
  } catch (error) {
    rmSync(tempProfilePath, { recursive: true, force: true });
    throw error;
  }

  return localProfilePath;
}
