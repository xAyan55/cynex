import type { MonetizationConfig } from '../config/types';

export interface AdPlacement {
  placement: string;
  format: string;
  zoneId: string;
}

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

const PLACEMENT_CONFIG_MAP: Record<string, string> = {
  dashboardTop: 'placementDashboardTop',
  dashboardBottom: 'placementDashboardBottom',
  sidebar: 'placementSidebar',
  earnPage: 'placementEarnPage',
  store: 'placementStore',
  wallet: 'placementWallet',
  purchases: 'placementPurchases',
  instances: 'placementInstances',
};

export function getActivePlacements(
  config: MonetizationConfig | null,
  requestPath: string,
): AdPlacement[] {
  if (!config || !config.enabled || !config.adsterraEnabled) return [];

  const path = requestPath.toLowerCase();
  const placementsToCheck: string[] = [];

  if (path.startsWith('/dashboard')) placementsToCheck.push('dashboardTop', 'dashboardBottom', 'sidebar');
  if (path.startsWith('/earn')) placementsToCheck.push('earnPage');
  if (path.startsWith('/store')) placementsToCheck.push('store');
  if (path.startsWith('/wallet')) placementsToCheck.push('wallet');
  if (path.startsWith('/purchases')) placementsToCheck.push('purchases');
  if (path.startsWith('/server/')) placementsToCheck.push('instances');

  const result: AdPlacement[] = [];
  for (const placement of placementsToCheck) {
    const configKey = PLACEMENT_CONFIG_MAP[placement];
    if (!configKey) continue;
    const format = (config as any)[configKey] as string;
    if (!format) continue;

    const zoneConfigKey = AD_FORMAT_ZONE_MAP[format];
    if (!zoneConfigKey) continue;
    const zoneId = (config as any)[zoneConfigKey] as string;
    if (!zoneId) continue;

    result.push({ placement, format, zoneId });
  }

  return result;
}

export function getAdsterraWidgetHtml(format: string, zoneId: string): string {
  switch (format) {
    case 'popunder':
      return `<script type="text/javascript">var adsterra_w=window.adsterra_w||{};adsterra_w['zone_${zoneId}']={id:'${zoneId}'};</script><script type="text/javascript" src="//www.adsterracdn.com/script.js" async></script>`;

    case 'native':
      return `<script type="text/javascript">atOptions={key:'${zoneId}',format:'iframe',height:250,width:300,params:{}};</script><script type="text/javascript" src="//www.highperformanceformat.com/${zoneId}/invoke.js" async></script>`;

    case 'banner':
      return `<script type="text/javascript">atOptions={key:'${zoneId}',format:'iframe',height:90,width:728,params:{}};</script><script type="text/javascript" src="//www.highperformanceformat.com/${zoneId}/invoke.js" async></script>`;

    case 'smartlink':
      return `<a href="//www.highperformanceformat.com/${zoneId}/invoke" target="_blank" rel="noopener" class="ad-smartlink block w-full text-center text-sm text-neutral-500 hover:text-neutral-300 transition">Sponsored Link</a>`;

    case 'socialbar':
      return `<script type="text/javascript">var adsterra_w=window.adsterra_w||{};adsterra_w['zone_${zoneId}']={id:'${zoneId}'};</script><script type="text/javascript" src="//www.adsterracdn.com/script.js" async></script>`;

    case '468x60':
    case '300x250':
    case '160x300':
    case '160x600':
    case '320x50':
    case '728x90':
      const dims = format === '468x60' ? { w: 468, h: 60 }
        : format === '300x250' ? { w: 300, h: 250 }
        : format === '160x300' ? { w: 160, h: 300 }
        : format === '160x600' ? { w: 160, h: 600 }
        : format === '320x50' ? { w: 320, h: 50 }
        : { w: 728, h: 90 };
      return `<script type="text/javascript">atOptions={key:'${zoneId}',format:'iframe',height:${dims.h},width:${dims.w},params:{}};</script><script type="text/javascript" src="//www.highperformanceformat.com/${zoneId}/invoke.js" async></script>`;

    default:
      return '';
  }
}
