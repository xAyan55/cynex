import type { Images } from '../../../../generated/prisma/client';
import {
  detectPluginLoader,
  getMinecraftVersionFromImage,
  getServerVariablesRecord,
  PLUGIN_SERVER_LOADERS,
} from '../../../../handlers/utils/server/pluginServer';
import { ModrinthVersion } from '../types/modrinth-api';
import type { CompatibilityResult } from '../types/modrinth-api';

const BUKKIT_LOADERS = new Set(PLUGIN_SERVER_LOADERS.map((l) => l.toLowerCase()));
const MOD_LOADERS = new Set(['fabric', 'forge', 'neoforge', 'quilt']);

function getCompatibleLoaders(serverLoader: string | null): string[] {
  if (!serverLoader) return [];
  const lower = serverLoader.toLowerCase();
  if (BUKKIT_LOADERS.has(lower)) return Array.from(BUKKIT_LOADERS);
  if (MOD_LOADERS.has(lower)) return [lower];
  return [lower];
}

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

export { mcVersionMatch, serverVersionMatch, getCompatibleLoaders };

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

    const errors: string[] = [];
    const warnings: string[] = [];

    const compatibleLoaders = getCompatibleLoaders(loader);

    if (!loader) {
      errors.push('This server does not appear to support Bukkit-style plugins.');
    }

    if (loader && version.loaders.length > 0) {
      const loaderMatches = version.loaders.some((entry) =>
        compatibleLoaders.includes(entry.toLowerCase()),
      );
      if (!loaderMatches) {
        const message = `Plugin version does not support ${loader} (supports: ${version.loaders.join(', ')}).`;
        if (isAdmin) warnings.push(message);
        else errors.push(message);
      }
    }

    if (minecraftVersion && version.game_versions.length > 0) {
      const matches = serverVersionMatch(minecraftVersion, version.game_versions);
      if (!matches) {
        const message = `Plugin version does not list Minecraft ${minecraftVersion} as supported (supports: ${version.game_versions.join(', ')}).`;
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
