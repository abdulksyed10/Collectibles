import type { CollectionRepository, Item, ItemDraft, PreparedPhoto } from './models';
import type { SelectedPhotoAsset } from './photoSelection';
import { appendPhotoAssets } from './photoSelection';
import { confirmPhotoUpload } from './itemPhoto';

export type BatchUploadStatus = 'queued' | 'preparing' | 'creating' | 'uploading' | 'publishing' | 'saved' | 'failed' | 'paused';
export type BatchUploadJob = {
  id: string; requestId: string; asset: SelectedPhotoAsset; status: BatchUploadStatus;
  itemId?: string; error?: string;
  // Freeze before the first request: its response may be lost after committing.
  requestDraft?: ItemDraft;
  placement?: Pick<Item, 'collection_id' | 'category_id'>;
};

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

type BatchOptions = {
  repository: Pick<CollectionRepository, 'createUploadDraft' | 'readOwnedItem' | 'readImages' | 'uploadPhoto' | 'saveItem'>;
  prepare: (asset: SelectedPhotoAsset) => Promise<PreparedPhoto>;
  shouldStop: () => boolean;
  isActive: () => boolean;
  onChange: (jobs: BatchUploadJob[]) => void;
};

/** Process one photo at a time. Network/service failures pause the rest so an
 * ambiguous creation always resolves before we choose parents for a sibling. */
export async function runUploadBatch(initial: BatchUploadJob[], draft: ItemDraft, options: BatchOptions): Promise<BatchUploadJob[]> {
  const { repository } = options;
  let jobs = initial.map(job => ({ ...job }));
  let placement = jobs.find(job => job.placement)?.placement;
  let paused = false;
  function update(index: number, change: Partial<BatchUploadJob>) {
    jobs = jobs.map((job, i) => i === index ? { ...job, ...change } : job);
    if (options.isActive()) options.onChange(jobs);
  }
  function checkActive() { if (!options.isActive()) throw new Error('Upload paused.'); }
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index]!;
    if (job.status === 'saved') continue;
    if (paused || options.shouldStop() || !options.isActive()) { update(index, { status: 'paused' }); continue; }
    let localPreparation = false;
    try {
      update(index, { error: undefined });
      let saved: Item | null = null;
      let hasPhoto = false;
      let prepared: PreparedPhoto | undefined;
      if (job.itemId) {
        saved = await repository.readOwnedItem(job.itemId);
        checkActive();
        if (!saved) throw new Error('This draft was deleted. Close this window to start a new upload.');
        hasPhoto = (await repository.readImages([saved.id])).some(image => image.itemId === saved!.id);
      } else if (job.requestDraft) {
        // Reconcile a lost creation response before reading the file again.
        // Otherwise a now-unreadable file could let later jobs create new parents.
        update(index, { status: 'creating' });
        saved = await repository.createUploadDraft(job.requestDraft, job.requestId);
        update(index, { itemId: saved.id, placement: savedItemPlacement(saved) });
        checkActive();
        hasPhoto = (await repository.readImages([saved.id])).some(image => image.itemId === saved!.id);
      }
      if (saved) placement ??= savedItemPlacement(saved);
      if (!hasPhoto) {
        checkActive();
        localPreparation = true;
        update(index, { status: 'preparing' });
        prepared = await options.prepare(job.asset);
        localPreparation = false;
      }
      checkActive();
      if (!saved) {
        const requestDraft = job.requestDraft ?? { ...(placement ? draftForSavedPlacement(draft, placement) : draft) };
        update(index, { status: 'creating', requestDraft });
        saved = await repository.createUploadDraft(requestDraft, job.requestId);
        update(index, { itemId: saved.id, placement: savedItemPlacement(saved) });
      }
      placement ??= savedItemPlacement(saved);
      update(index, { placement: savedItemPlacement(saved) });
      checkActive();
      if (!hasPhoto) {
        update(index, { status: 'uploading' });
        await confirmPhotoUpload(repository, saved.id, prepared!);
      }
      checkActive();
      if (saved.visibility !== (draft.visibility ?? 'private')) {
        update(index, { status: 'publishing' });
        await repository.saveItem(draftForSavedPlacement(draft, saved), saved.id);
      }
      update(index, { status: 'saved', error: undefined });
    } catch (reason) {
      update(index, { status: 'failed', error: reason instanceof Error ? reason.message : 'Unable to save this photo. Please retry.' });
      // Local unreadable images can be skipped. All server failures stop the
      // batch, including limits, permission changes and ambiguous responses.
      if (!localPreparation) paused = true;
    }
  }
  return jobs;
}

function savedItemPlacement(item: Item) {
  return { collection_id: item.collection_id, category_id: item.category_id };
}
