import type { Images } from '../../../generated/prisma/client';

export const PLUGIN_SERVER_LOADERS = ['paper', 'purpur', 'spigot', 'bukkit', 'folia'] as const;

export type PluginServerLoader = (typeof PLUGIN_SERVER_LOADERS)[number];

const EXCLUDED_LOADERS = new Set([
  'forge',
  'fabric',
  'neoforge',
  'quilt',
  'vanilla',
  'bedrock',
  'velocity',
  'waterfall',
  'bungeecord',
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

export function detectPluginLoader(image: Images | null | undefined): PluginServerLoader | null {
  if (!image) return null;

  const info = parseImageInfo(image);
  const explicitType = typeof info?.type === 'string' ? info.type.toLowerCase() : '';
  if (PLUGIN_SERVER_LOADERS.includes(explicitType as PluginServerLoader)) {
    return explicitType as PluginServerLoader;
  }

  const haystack = collectImageText(image);
  for (const loader of PLUGIN_SERVER_LOADERS) {
    if (haystack.includes(loader)) {
      return loader;
    }
  }

  return null;
}

export function isPluginServer(image: Images | null | undefined): boolean {
  if (!image) return false;

  const info = parseImageInfo(image);
  if (info?.pluginServer === true) return true;
  if (info?.pluginServer === false) return false;

  const loader = detectPluginLoader(image);
  if (!loader) return false;

  const haystack = collectImageText(image);
  for (const excluded of EXCLUDED_LOADERS) {
    if (haystack.includes(excluded) && !haystack.includes(loader)) {
      return false;
    }
  }

  return true;
}

export function getMinecraftVersionFromImage(image: Images | null | undefined): string | null {
  if (!image?.variables) return null;

  try {
    const variables = JSON.parse(image.variables) as Array<{
      env?: string;
      env_variable?: string;
      value?: string | number | boolean;
      default?: string | number | boolean;
      default_value?: string | number | boolean;
    }>;

    const versionKeys = ['MINECRAFT_VERSION', 'MC_VERSION', 'SERVER_VERSION', 'VERSION'];
    for (const variable of variables) {
      const key = (variable.env_variable || variable.env || '').toUpperCase();
      if (!versionKeys.includes(key)) continue;
      const raw = variable.value ?? variable.default ?? variable.default_value;
      if (raw === undefined || raw === null || raw === '') continue;
      return String(raw).replace(/^mc\.?/i, '').trim();
    }
  } catch {
    return null;
  }

  return null;
}

export function getServerVariablesRecord(
  variablesJson: string | null | undefined,
): Record<string, string> {
  if (!variablesJson) return {};

  try {
    const variables = JSON.parse(variablesJson) as Array<{
      env?: string;
      env_variable?: string;
      value?: string | number | boolean;
      default?: string | number | boolean;
      default_value?: string | number | boolean;
    }>;

    const env: Record<string, string> = {};
    for (const variable of variables) {
      const key = variable.env_variable || variable.env;
      if (!key) continue;
      const raw = variable.value ?? variable.default ?? variable.default_value ?? '';
      env[key] = String(raw);
    }
    return env;
  } catch {
    return {};
  }
}
