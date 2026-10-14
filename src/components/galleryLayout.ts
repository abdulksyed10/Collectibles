export type GalleryLayout = {
  columns: number;
  cardWidth: number;
  gap: number;
  padding: number;
};

export const COLLECTION_SIDEBAR_WIDTH = 260;
const GAP = 14;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Calculates a gallery from the width of its actual content pane. */
export function getGalleryLayout(paneWidth: number): GalleryLayout {
  const width = Number.isFinite(paneWidth) ? Math.max(0, paneWidth) : 0;
  const padding = width >= 900 ? 32 : 16;
  const minimumCardWidth = width < 600 ? 156 : 232;
  const usableWidth = Math.max(0, width - padding * 2);
  const columns = Math.max(1, Math.floor((usableWidth + GAP) / (minimumCardWidth + GAP)));
  const cardWidth = usableWidth ? round((usableWidth - GAP * (columns - 1)) / columns) : 0;
  return { columns, cardWidth, gap: GAP, padding };
}

/** The signed-in desktop sidebar consumes space from its sibling pane only. */
export function getGalleryPaneWidth(viewportWidth: number, hasDesktopSidebar: boolean) {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  return Math.max(0, width - (hasDesktopSidebar ? COLLECTION_SIDEBAR_WIDTH : 0));
}
