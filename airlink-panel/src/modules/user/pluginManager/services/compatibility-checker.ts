import type { Images } from '../../../../generated/prisma/client';
import {
  detectPluginLoader,
  getMinecraftVersionFromImage,
  getServerVariablesRecord,
} from '../../../../handlers/utils/server/pluginServer';
import { ModrinthVersion } from '../types/modrinth-api';
import type { CompatibilityResult } from '../types/modrinth-api';

function mcVersionMatch(serverVersion: string, gameVersion: string): boolean {
  if (!serverVersion || !gameVersion) return false;
  gameVersion = gameVersion.replace(/\.x$/i, '');
  const parseMc = (v: string) => {
    const parts = v.split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] ?? 0, patch: parts[2] };
  };
  const sv = parseMc(serverVersion);
  const gv = parseMc(gameVersion);
  if (sv.major !== gv.major) return false;
  if (sv.minor !== gv.minor) return false;
  if (gv.patch === undefined) return true;
  return (sv.patch ?? 0) >= gv.patch;
}

function serverVersionMatch(serverVersion: string, gameVersions: string[]): boolean {
  if (!serverVersion || !gameVersions || !gameVersions.length) return false;
  return gameVersions.some((gv) => mcVersionMatch(serverVersion, gv));
}

export class CompatibilityChecker {
  check(
    image: Images,
    serverVariablesJson: string | null | undefined,
    version: ModrinthVersion,
    isAdmin: boolean,
  ): CompatibilityResult {
    const loader = detectPluginLoader(image);
    const minecraftVersion =
      getMinecraftVersionFromImage(image) ||
      getServerVariablesRecord(serverVariablesJson).MINECRAFT_VERSION ||
      getServerVariablesRecord(serverVariablesJson).MC_VERSION ||
      null;

    const warnings: string[] = [];
    const errors: string[] = [];

    if (!loader) {
      errors.push('This server does not appear to support Bukkit-style plugins.');
    }

    if (minecraftVersion && version.game_versions.length > 0) {
      const matches = serverVersionMatch(minecraftVersion, version.game_versions);
      if (!matches) {
        const message = `Plugin version does not list Minecraft ${minecraftVersion} as supported.`;
        if (isAdmin) warnings.push(message);
        else errors.push(message);
      }
    }

    if (loader && version.loaders.length > 0) {
      const loaderMatches = version.loaders.some((entry) => entry.toLowerCase() === loader.toLowerCase());
      if (!loaderMatches) {
        const message = `Plugin version does not list ${loader} as a supported loader.`;
        if (isAdmin) warnings.push(message);
        else errors.push(message);
      }
    }

    const javaVersion = getServerVariablesRecord(serverVariablesJson).JAVA_VERSION;
    if (!javaVersion) {
      warnings.push('Java version could not be determined from server variables.');
    }

    return {
      compatible: errors.length === 0,
      warnings,
      errors,
      minecraftVersion,
      loader,
      forceAllowed: isAdmin,
    };
  }
}
