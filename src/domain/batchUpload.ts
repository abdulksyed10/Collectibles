import type { ItemDraft } from './models';
import type { SelectedPhotoAsset } from './photoSelection';
import { appendPhotoAssets } from './photoSelection';

export type BatchUploadStatus = 'queued' | 'preparing' | 'creating' | 'uploading' | 'publishing' | 'saved' | 'failed' | 'paused';
export type BatchUploadJob = { id: string; requestId: string; asset: SelectedPhotoAsset; status: BatchUploadStatus; itemId?: string; error?: string };

export function appendUploadJobs(current: BatchUploadJob[], assets: SelectedPhotoAsset[], createRequestId: () => string): BatchUploadJob[] {
  appendPhotoAssets(current.map(job => job.asset), assets);
  return [...current, ...assets.map(asset => {
    const requestId = createRequestId();
    return { id: requestId, requestId, asset, status: 'queued' as const };
  })];
}

/** Once the first draft resolves its inline parents, later jobs reuse them. */
export function draftForSavedPlacement(draft: ItemDraft, item: Pick<{ collection_id: string; category_id: string | null }, 'collection_id' | 'category_id'>): ItemDraft {
  return {
    title: draft.title,
    notes: draft.notes,
    collectionId: item.collection_id,
    categoryId: item.category_id,
    visibility: draft.visibility,
    acquiredOn: draft.acquiredOn,
  };
}
