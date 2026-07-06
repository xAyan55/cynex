import type { Images } from '../../../../generated/prisma/client';
import type { ModrinthVersion } from '../types/modrinth-api';

export const LOADER_GROUPS = {
  PLUGIN: new Set(['paper', 'purpur', 'spigot', 'bukkit', 'folia']),
  MOD: new Set(['fabric', 'forge', 'neoforge', 'quilt']),
  PROXY: new Set(['velocity', 'waterfall', 'bungeecord']),
} as const;

export type LoaderGroup = keyof typeof LOADER_GROUPS;

export const ALL_LOADERS = new Set([
  ...LOADER_GROUPS.PLUGIN,
  ...LOADER_GROUPS.MOD,
  ...LOADER_GROUPS.PROXY,
]);

function collectImageText(image: Images): string {
  return [
    image.name,
    image.description,
    image.dockerImages,
    image.startup,
    image.meta,
    image.info,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function parseImageInfo(image: Images): Record<string, unknown> | null {
  if (!image.info) return null;
  try {
    return typeof image.info === 'string' ? JSON.parse(image.info) : (image.info as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function detectServerSoftware(image: Images | null | undefined): string | null {
  if (!image) return null;

  const info = parseImageInfo(image);
  const explicitType = typeof info?.type === 'string' ? info.type.toLowerCase() : '';
  if (explicitType && ALL_LOADERS.has(explicitType)) {
    return explicitType;
  }

  const haystack = collectImageText(image);
  for (const loader of ALL_LOADERS) {
    if (haystack.includes(loader)) {
      return loader;
    }
  }

  return null;
}

export function getLoaderGroup(software: string | null): LoaderGroup | null {
  if (!software) return null;
  for (const [group, loaders] of Object.entries(LOADER_GROUPS)) {
    if (loaders.has(software.toLowerCase())) {
      return group as LoaderGroup;
    }
  }
  return null;
}

export function getGroupLoaders(group: LoaderGroup | null): string[] {
  if (!group) return [];
  return Array.from(LOADER_GROUPS[group]);
}

export function isCompatibleLoader(serverLoader: string | null, versionLoaders: string[]): boolean {
  if (!serverLoader || !versionLoaders || !versionLoaders.length) return false;
  const group = getLoaderGroup(serverLoader);
  if (!group) return false;
  const groupLoaders = getGroupLoaders(group);
  return versionLoaders.some((l) => groupLoaders.includes(l.toLowerCase()));
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

export function isCompatibleMinecraftVersion(serverVersion: string | null, gameVersions: string[]): boolean {
  if (!serverVersion || !gameVersions || !gameVersions.length) return false;
  return gameVersions.some((gv) => mcVersionMatch(serverVersion, gv));
}

export function filterVersionsByGroup(versions: ModrinthVersion[], serverLoader: string | null): ModrinthVersion[] {
  const group = getLoaderGroup(serverLoader);
  if (!group) return [];
  const groupLoaders = getGroupLoaders(group);

  return versions.filter((v) => {
    const loaderMatch = v.loaders.some((l) => groupLoaders.includes(l.toLowerCase()));
    return loaderMatch;
  });
}

export function sortVersions(versions: ModrinthVersion[]): ModrinthVersion[] {
  return [...versions].sort((a, b) => {
    const aIsRelease = a.version_type === 'release' ? 1 : 0;
    const bIsRelease = b.version_type === 'release' ? 1 : 0;
    if (aIsRelease !== bIsRelease) return bIsRelease - aIsRelease;

    const aFeatured = a.featured ? 1 : 0;
    const bFeatured = b.featured ? 1 : 0;
    if (aFeatured !== bFeatured) return bFeatured - aFeatured;

    return new Date(b.date_published || 0).getTime() - new Date(a.date_published || 0).getTime();
  });
}

export interface VersionDebugInfo {
  versionId: string;
  versionName: string;
  versionNumber: string;
  versionType: string;
  loaders: string[];
  gameVersions: string[];
  serverLoader: string | null;
  serverLoaderGroup: string | null;
  loaderAccepted: boolean;
  loaderReason: string;
  mcAccepted: boolean;
  mcReason: string;
  overallAccepted: boolean;
}

export function debugVersion(version: ModrinthVersion, serverLoader: string | null, minecraftVersion: string | null): VersionDebugInfo {
  const group = getLoaderGroup(serverLoader);
  const groupLoaders = group ? getGroupLoaders(group) : [];

  const loaderMatch = serverLoader
    ? version.loaders.some((l) => groupLoaders.includes(l.toLowerCase()))
    : false;
  const loaderReason = serverLoader
    ? (loaderMatch
      ? `Loader ${version.loaders.filter((l) => groupLoaders.includes(l.toLowerCase())).join(', ')} is in group ${group || 'N/A'}`
      : `Loader group mismatch. Server group: ${group || 'N/A'} (${groupLoaders.join(', ')}), version loaders: ${version.loaders.join(', ')}`)
    : 'No server loader detected';

  const mcMatch = minecraftVersion
    ? isCompatibleMinecraftVersion(minecraftVersion, version.game_versions)
    : false;
  const mcReason = minecraftVersion
    ? (mcMatch
      ? `Minecraft ${minecraftVersion} matches one of ${version.game_versions.join(', ')}`
      : `Minecraft ${minecraftVersion} does not match any of ${version.game_versions.join(', ')}`)
    : 'No server MC version detected';

  return {
    versionId: version.id,
    versionName: version.name || version.version_number,
    versionNumber: version.version_number,
    versionType: version.version_type,
    loaders: version.loaders,
    gameVersions: version.game_versions,
    serverLoader,
    serverLoaderGroup: group,
    loaderAccepted: loaderMatch,
    loaderReason,
    mcAccepted: mcMatch,
    mcReason,
    overallAccepted: loaderMatch && (mcMatch || !minecraftVersion),
  };
}

export function selectBestVersion(
  versions: ModrinthVersion[],
  serverLoader: string | null,
  minecraftVersion: string | null,
): ModrinthVersion | null {
  const sorted = sortVersions(versions);

  for (const v of sorted) {
    const info = debugVersion(v, serverLoader, minecraftVersion);
    if (info.overallAccepted) return v;
  }

  return null;
}
