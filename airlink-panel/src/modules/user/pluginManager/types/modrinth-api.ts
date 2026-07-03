import { z } from 'zod';

export const ModrinthProjectSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  project_type: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  body: z.string().optional(),
  downloads: z.number().optional().default(0),
  followers: z.number().optional().default(0),
  categories: z.array(z.string()).optional().default([]),
  game_versions: z.array(z.string()).optional().default([]),
  loaders: z.array(z.string()).optional().default([]),
  icon_url: z.string().optional(),
  license: z.object({ name: z.string(), id: z.string().optional() }).optional(),
  source_url: z.string().optional(),
  issues_url: z.string().optional(),
  wiki_url: z.string().optional(),
  published: z.string().optional(),
  updated: z.string().optional(),
  gallery: z.array(z.object({
    url: z.string(),
    featured: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  })).optional().default([]),
});

export type ModrinthProject = z.infer<typeof ModrinthProjectSchema>;

export const ModrinthVersionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  version_type: z.string(),
  changelog: z.string().optional(),
  game_versions: z.array(z.string()).optional().default([]),
  loaders: z.array(z.string()).optional().default([]),
  date_published: z.string().optional(),
  dependencies: z.array(z.object({
    project_id: z.string().optional(),
    version_id: z.string().nullable().optional(),
    dependency_type: z.string(),
  })).optional().default([]),
  files: z.array(z.object({
    hashes: z.object({
      sha1: z.string().optional(),
      sha512: z.string().optional(),
    }).optional(),
    url: z.string(),
    filename: z.string(),
    primary: z.boolean().optional().default(false),
    size: z.number().optional().default(0),
  })).optional().default([]),
});

export type ModrinthVersion = z.infer<typeof ModrinthVersionSchema>;

export const ModrinthSearchHitSchema = z.object({
  project_id: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  project_type: z.string().optional(),
  author: z.string().optional(),
  icon_url: z.string().optional(),
  downloads: z.number().optional().default(0),
  follows: z.number().optional().default(0),
  categories: z.array(z.string()).optional().default([]),
  date_modified: z.string().optional(),
  latest_version: z.string().optional(),
  license: z.string().optional(),
  gallery: z.array(z.string()).optional().default([]),
});

export type ModrinthSearchHit = z.infer<typeof ModrinthSearchHitSchema>;

export const ModrinthSearchResponseSchema = z.object({
  hits: z.array(ModrinthSearchHitSchema).optional().default([]),
  total_hits: z.number().optional().default(0),
  offset: z.number().optional().default(0),
  limit: z.number().optional().default(20),
});

export type ModrinthSearchResponse = z.infer<typeof ModrinthSearchResponseSchema>;

export interface DaemonFileEntry {
  name: string;
  type?: string;
  size?: number;
  modified?: string;
}

export interface InstalledPlugin {
  filename: string;
  enabled: boolean;
  size: number;
  modifiedAt: string | null;
  projectId: string | null;
  projectName: string | null;
  versionId: string | null;
  versionNumber: string | null;
  author: string | null;
  installedAt: string | null;
  installationId: number | null;
  updateAvailable: boolean;
  latestVersionNumber: string | null;
  latestVersionId: string | null;
  ignoredUpdate: boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  warnings: string[];
  errors: string[];
  minecraftVersion: string | null;
  loader: string | null;
  forceAllowed: boolean;
}

export interface PluginInstallProgress {
  serverId: string;
  operationId: string;
  projectId: string;
  projectName: string;
  stage: 'initializing' | 'downloading' | 'validating' | 'installing' | 'moving' | 'completed' | 'failed';
  stageMessage: string;
  overallProgress: number;
  error?: string;
  warnings: string[];
  startTime: number;
  lastUpdate: number;
}
