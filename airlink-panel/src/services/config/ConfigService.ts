import prisma from '../../db';
import { ConfigCategory, Prisma } from '../../generated/prisma/client';
import {
  EconomyConfig,
  StoreConfig,
  DefaultServerConfig,
  RenewalConfig,
  LimitsConfig,
  UIConfig,
  defaultValues,
} from './types';

type JsonValue = Prisma.JsonValue;

function parseJson<T>(value: JsonValue, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as unknown as T;
  try {
    return JSON.parse(value as string) as T;
  } catch {
    return fallback;
  }
}

function buildConfig<T>(rows: { key: string; value: JsonValue }[], defaults: Record<string, unknown>): T {
  const map = new Map<string, unknown>();
  for (const row of rows) {
    map.set(row.key, parseJson(row.value, (defaults as Record<string, unknown>)[row.key]));
  }
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(defaults)) {
    result[key] = map.has(key) ? map.get(key) : def;
  }
  return result as unknown as T;
}

export class ConfigService {
  private static async getCategoryRows(category: ConfigCategory) {
    return prisma.config.findMany({ where: { category } });
  }

  static async economy(): Promise<EconomyConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.ECONOMY);
    return buildConfig<EconomyConfig>(rows, defaultValues.economy);
  }

  static async store(): Promise<StoreConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.STORE);
    return buildConfig<StoreConfig>(rows, defaultValues.store);
  }

  static async defaults(): Promise<DefaultServerConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.DEFAULTS);
    return buildConfig<DefaultServerConfig>(rows, defaultValues.defaults);
  }

  static async renewals(): Promise<RenewalConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.RENEWALS);
    return buildConfig<RenewalConfig>(rows, defaultValues.renewals);
  }

  static async limits(): Promise<LimitsConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.LIMITS);
    return buildConfig<LimitsConfig>(rows, defaultValues.limits);
  }

  static async ui(): Promise<UIConfig> {
    const rows = await this.getCategoryRows(ConfigCategory.UI);
    return buildConfig<UIConfig>(rows, defaultValues.ui);
  }

  static async updateCategory(category: ConfigCategory, data: Record<string, unknown>) {
    const entries = Object.entries(data);
    for (const [key, value] of entries) {
      await prisma.config.upsert({
        where: { category_key: { category, key } },
        create: { category, key, value: value as JsonValue },
        update: { value: value as JsonValue },
      });
    }
  }

  static async getAll(): Promise<Record<string, Record<string, unknown>>> {
    const all = await prisma.config.findMany();
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const row of all) {
      const cat = row.category.toLowerCase();
      if (!grouped[cat]) grouped[cat] = {};
      grouped[cat][row.key] = parseJson(row.value, null);
    }
    for (const [cat, defaults] of Object.entries(defaultValues)) {
      if (!grouped[cat]) grouped[cat] = {};
      for (const [key, def] of Object.entries(defaults)) {
        if (!(key in grouped[cat])) {
          grouped[cat][key] = def;
        }
      }
    }
    return grouped;
  }
}
