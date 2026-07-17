import type { MonetizationConfig } from '../config/types';

const AD_FORMAT_ZONE_MAP: Record<string, string> = {
  popunder: 'adsterraPopunderId',
  native: 'adsterraNativeBannerId',
  banner: 'adsterraBannerId',
  smartlink: 'adsterraSmartlinkId',
  socialbar: 'adsterraSocialBarId',
  '468x60': 'adsterra468x60Id',
  '300x250': 'adsterra300x250Id',
  '160x300': 'adsterra160x300Id',
  '160x600': 'adsterra160x600Id',
  '320x50': 'adsterra320x50Id',
  '728x90': 'adsterra728x90Id',
};

const FORMAT_DIMENSIONS: Record<string, { w: number; h: number }> = {
  '468x60': { w: 468, h: 60 },
  '300x250': { w: 300, h: 250 },
  '160x300': { w: 160, h: 300 },
  '160x600': { w: 160, h: 600 },
  '320x50': { w: 320, h: 50 },
  '728x90': { w: 728, h: 90 },
  native: { w: 300, h: 250 },
  banner: { w: 728, h: 90 },
};

export function renderPlacement(
  config: MonetizationConfig | null,
  placementName: string,
): string {
  if (!config || !config.enabled || !config.adsterraEnabled) return '';

  const configKey = 'placement' + placementName.charAt(0).toUpperCase() + placementName.slice(1);
  const format = (config as any)[configKey] as string | undefined;
  if (!format) return '';

  const zoneConfigKey = AD_FORMAT_ZONE_MAP[format];
  if (!zoneConfigKey) return '';
  const zoneId = (config as any)[zoneConfigKey] as string | undefined;
  if (!zoneId) return '';

  const dims = FORMAT_DIMENSIONS[format];

  return `<div class="cynex-ad-wrapper" data-cynex-placement="${placementName}" data-cynex-format="${format}" data-cynex-zone="${zoneId}"${dims ? ` data-cynex-width="${dims.w}" data-cynex-height="${dims.h}"` : ''}></div>`;
}

export function renderSmartlink(
  config: MonetizationConfig | null,
): string {
  if (!config || !config.enabled || !config.adsterraEnabled) return '';
  const smartlinkId = config.adsterraSmartlinkId;
  if (!smartlinkId) return '';

  return `<a href="https://www.highperformanceformat.com/${encodeURIComponent(smartlinkId)}/invoke" target="_blank" rel="noopener" class="cynex-ad-smartlink" data-cynex-placement="smartlink">Sponsored</a>`;
}
