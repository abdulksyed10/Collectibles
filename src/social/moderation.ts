import type { PublicReportReason } from '../domain/models';

type SharedReportRepository = {
  reportPublicContent: (target: { itemId?: string; collectionId?: string; reason: PublicReportReason; details?: string }) => Promise<void>;
};

type SharedBlockRepository = {
  blockCollector: (publisherId: string) => Promise<void>;
};

export type SharedReportTarget = {
  itemId?: string;
  collectionId?: string;
  reason: PublicReportReason;
  details?: string;
};

/**
 * Friends-only entries do not have to be public to be reportable. The database
 * determines whether the signed-in reporter is allowed to see the target.
 */
export async function reportSharedContent(repository: SharedReportRepository, target: SharedReportTarget) {
  if (Boolean(target.itemId) === Boolean(target.collectionId)) {
    throw new Error('Choose one shared entry or collection to report.');
  }
  await repository.reportPublicContent(target);
}

/** Blocking uses the publisher ID, so it also works for Friends-only content. */
export async function blockSharedCollector(repository: SharedBlockRepository, publisherId: string) {
  await repository.blockCollector(publisherId);
}
