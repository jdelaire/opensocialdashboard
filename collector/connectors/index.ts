import { Connector, Platform } from "../types.js";
import { instagramConnector } from "./instagram.js";
import { rednoteConnector } from "./rednote.js";
import { tiktokConnector } from "./tiktok.js";
import { xConnector } from "./x.js";
import { youtubeConnector } from "./youtube.js";

const connectors: Record<Platform, Connector> = {
  instagram: instagramConnector,
  tiktok: tiktokConnector,
  rednote: rednoteConnector,
  youtube: youtubeConnector,
  x: xConnector
};

export function getConnector(platform: Platform): Connector {
  return connectors[platform];
}
