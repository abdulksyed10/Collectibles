import type { PublicInfoPage } from '../screens/PublicInfoScreen';

const pages = new Set<PublicInfoPage>(['privacy', 'terms', 'community', 'support', 'delete-account']);

export function publicInfoPageFromUrl(value: string): PublicInfoPage | null {
  try {
    const pathname = new URL(value).pathname.replace(/^\/+|\/+$/g, '');
    return pages.has(pathname as PublicInfoPage) ? pathname as PublicInfoPage : null;
  } catch { return null; }
}
