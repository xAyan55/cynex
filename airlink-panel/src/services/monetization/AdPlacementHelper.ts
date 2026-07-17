import type { MonetizationConfig } from '../config/types';

const ZONE_CONFIG_KEY_MAP: Record<string, string> = {
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

const IFORMAT_DIMENSIONS: Record<string, { w: number; h: number }> = {
  '468x60': { w: 468, h: 60 },
  '300x250': { w: 300, h: 250 },
  '160x300': { w: 160, h: 300 },
  '160x600': { w: 160, h: 600 },
  '320x50': { w: 320, h: 50 },
  '728x90': { w: 728, h: 90 },
  banner: { w: 728, h: 90 },
};

function cfg(config: MonetizationConfig, key: string): string {
  return ((config as unknown as Record<string, unknown>)[key] as string) || '';
}

function renderIframe(zoneId: string, format: string, placement: string): string {
  const dims = IFORMAT_DIMENSIONS[format] || IFORMAT_DIMENSIONS['728x90'];
  const wrapperId = 'cynex-' + placement;
  return `<div id="${wrapperId}" class="cynex-ad-wrapper" data-cynex-placement="${placement}" data-cynex-format="${format}" data-cynex-zone="${zoneId}" style="text-align:center;margin:1rem 0;overflow:hidden;max-width:100%;">
    <iframe src="https://www.highperformanceformat.com/${encodeURIComponent(zoneId)}/invoke"
      width="${dims.w}" height="${dims.h}"
      frameborder="0" scrolling="no" marginwidth="0" marginheight="0"
      style="max-width:100%;border:none;display:inline-block;overflow:hidden;"
      loading="lazy">
    </iframe>
  </div>`;
}

function renderContainer(zoneId: string, format: string, placement: string): string {
  return `<div class="cynex-ad-wrapper" id="cynex-${placement}" data-cynex-placement="${placement}" data-cynex-format="${format}" data-cynex-zone="${zoneId}"></div>`;
}

export function renderPlacement(
  config: MonetizationConfig | null,
  placementName: string,
): string {
  if (!config || !config.enabled || !config.adsterraEnabled) return '';

  const configKey = 'placement' + placementName.charAt(0).toUpperCase() + placementName.slice(1);
  const format = cfg(config, configKey);
  if (!format) return '';

  const zoneConfigKey = ZONE_CONFIG_KEY_MAP[format];
  if (!zoneConfigKey) return '';
  const zoneId = cfg(config, zoneConfigKey);
  if (!zoneId) return '';

  // smartlink — render as link directly
  if (format === 'smartlink') {
    return renderSmartlink(config);
  }

  // display formats (728x90, 300x250, banner, 468x60, 320x50, 160x300, 160x600) — iframe
  if (format === 'banner' || format === '728x90' || format === '300x250' || format === '468x60' || format === '320x50' || format === '160x300' || format === '160x600') {
    return renderIframe(zoneId, format, placementName);
  }

  // native, popunder, socialbar — container for client-side injection
  return renderContainer(zoneId, format, placementName);
}

export function renderSmartlink(
  config: MonetizationConfig | null,
): string {
  if (!config || !config.enabled || !config.adsterraEnabled) return '';
  const smartlinkId = config.adsterraSmartlinkId;
  if (!smartlinkId) return '';

  return `<a href="https://www.highperformanceformat.com/${encodeURIComponent(smartlinkId)}/invoke" target="_blank" rel="noopener" class="cynex-ad-smartlink" data-cynex-placement="smartlink">Sponsored</a>`;
}
