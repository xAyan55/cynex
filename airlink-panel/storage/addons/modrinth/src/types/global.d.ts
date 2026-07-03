/**
 * =============================================================================
 * File: global.d.ts
 * Author: g-flame
 * =============================================================================
 *
 * CREDITS:
 * - Addon developed by g-flame
 * - Panel by CynexGP
 * - Special thanks to Modrinth for platform and API
 * - Thanks to all contributors
 *
 * NOTES:
 * - This file is part of the CynexGP Addons – Modrinth Store project
 * - All TypeScript logic written by g-flame
 *
 * =============================================================================
 */
declare module "multer" {
  interface File {
    buffer: Buffer;
    originalname: string;
  }
}
