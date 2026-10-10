import type { LikeState, SocialRepository } from './types';

type LikeRepository = Pick<SocialRepository, 'setItemLiked' | 'getEntrySocialState'>;
type Listener = (value: LikeState) => void;

export type LikeStore = {
  get: (itemId: string) => LikeState | undefined;
  sync: (itemId: string, value: LikeState) => void;
  subscribe: (itemId: string, listener: Listener) => () => void;
  toggle: (itemId: string) => Promise<LikeState>;
  clear: () => void;
};

function sameLikeState(left: LikeState | undefined, right: LikeState) {
  return left?.count === right.count && left.likedByMe === right.likedByMe;
}

function normalise(value: LikeState): LikeState {
  return { count: Math.max(0, value.count), likedByMe: value.likedByMe };
}

export function createLikeStore(repository: LikeRepository): LikeStore {
  const values = new Map<string, LikeState>();
  const listeners = new Map<string, Set<Listener>>();
  const pending = new Set<string>();

  function publish(itemId: string, value: LikeState) {
    const next = normalise(value);
    if (sameLikeState(values.get(itemId), next)) return;
    values.set(itemId, next);
    listeners.get(itemId)?.forEach(listener => listener(next));
  }

  return {
    get(itemId) {
      return values.get(itemId);
    },
    sync(itemId, value) {
      // Feed/detail props can arrive after an interaction. Seed only unseen
      // items so an older response cannot replace confirmed local state.
      if (!pending.has(itemId) && !values.has(itemId)) publish(itemId, value);
    },
    subscribe(itemId, listener) {
      const itemListeners = listeners.get(itemId) ?? new Set<Listener>();
      itemListeners.add(listener);
      listeners.set(itemId, itemListeners);
      return () => {
        itemListeners.delete(listener);
        if (itemListeners.size === 0) listeners.delete(itemId);
      };
    },
    async toggle(itemId) {
      const before = values.get(itemId);
      if (!before) throw new Error('This item is no longer available. Refresh and try again.');
      if (pending.has(itemId)) return values.get(itemId) ?? before;

      pending.add(itemId);
      const desired = !before.likedByMe;
      publish(itemId, { count: before.count + (desired ? 1 : -1), likedByMe: desired });
      try {
        try {
          await repository.setItemLiked(itemId, desired);
        } catch (reason) {
          publish(itemId, before);
          throw reason;
        }
        const authoritative = (await repository.getEntrySocialState([itemId]))[itemId];
        if (!authoritative) throw new Error('Unable to confirm this like. Try again.');
        publish(itemId, authoritative);
        return values.get(itemId) ?? normalise(authoritative);
      } finally {
        pending.delete(itemId);
      }
    },
    clear() {
      values.clear();
      listeners.clear();
      pending.clear();
    },
  };
}
