import type { Images } from '../../../../generated/prisma/client';
import {
  detectPluginLoader,
  resolveMinecraftVersion,
  getServerVariablesRecord,
} from '../../../../handlers/utils/server/pluginServer';
import { ModrinthVersion } from '../types/modrinth-api';
import type { CompatibilityResult } from '../types/modrinth-api';
import {
  isCompatibleLoader,
  isCompatibleMinecraftVersion,
} from './compatibility-service';

export class CompatibilityChecker {
  check(
    image: Images,
    serverVariablesJson: string | null | undefined,
    version: ModrinthVersion,
    isAdmin: boolean,
  ): CompatibilityResult {
    const loader = detectPluginLoader(image);
    const minecraftVersion = resolveMinecraftVersion(image, serverVariablesJson);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!loader) {
      errors.push('This server does not appear to support Bukkit-style plugins.');
    }

    if (loader && version.loaders.length > 0) {
      const loaderMatches = isCompatibleLoader(loader, version.loaders);
      if (!loaderMatches) {
        const message = `Plugin version does not support ${loader} (supports: ${version.loaders.join(', ')}).`;
        if (isAdmin) warnings.push(message);
        else errors.push(message);
      }
    }

    if (minecraftVersion && version.game_versions.length > 0) {
      const matches = isCompatibleMinecraftVersion(minecraftVersion, version.game_versions);
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
