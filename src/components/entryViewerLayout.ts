export function getEntryViewerMediaHeight(viewportHeight: number) {
  const safeHeight = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  return Math.min(620, Math.max(250, Math.round(safeHeight * 0.56)));
}
