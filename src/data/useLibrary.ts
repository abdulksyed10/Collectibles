import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRepository } from './RepositoryProvider';
import type { Category, Collection, Item, ItemImage } from '../domain/models';
import { messageOf } from '../components/ui';
export function useLibrary(categoryId: string | undefined, collectionId: string | undefined, search: string) {
  const repository = useRepository();
  const [categories, setCategories] = useState<Category[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]); const [items, setItems] = useState<Item[]>([]); const [images, setImages] = useState<Record<string, ItemImage>>({});
  const [total, setTotal] = useState(0); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [moreLoading, setMoreLoading] = useState(false); const [error, setError] = useState(''); const [photoError, setPhotoError] = useState(''); const [revision, setRevision] = useState(0);
  const pageRef = useRef(0); const requestRef = useRef(0); const itemsRef = useRef<Item[]>([]); const loadingMoreRef = useRef(false);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    const request = ++requestRef.current; setLoading(true); setError(''); setPhotoError(''); setImages({}); setItems([]); itemsRef.current = []; pageRef.current = 0; loadingMoreRef.current = false; setMoreLoading(false);
    Promise.all([repository.listCategories(), repository.listCollections(), repository.listItems({ categoryId, collectionId, search, page: 0 })]).then(async ([nextCategories, nextCollections, page]) => {
      if (request !== requestRef.current) return;
      setCategories(nextCategories); setCollections(nextCollections); setItems(page.items); itemsRef.current = page.items; setTotal(page.total); setHasMore(page.hasMore); setLoading(false);
      try { const urls = await repository.readImages(page.items.map(item => item.id)); if (request === requestRef.current) setImages(Object.fromEntries(urls.map(image => [image.itemId, image]))); }
      catch { if (request === requestRef.current) setPhotoError('Photos couldn’t load. Your item details are still here.'); }
    }).catch(e => { if (request === requestRef.current) { setError(messageOf(e)); setLoading(false); } });
    return () => { requestRef.current++; };
  }, [categoryId, collectionId, search, revision, repository]);
  const refreshPhotos = useCallback(async () => {
    const request = requestRef.current;
    try { const urls = await repository.readImages(itemsRef.current.map(item => item.id)); if (request === requestRef.current) { setImages(Object.fromEntries(urls.map(image => [image.itemId, image]))); setPhotoError(''); } }
    catch { if (request === requestRef.current) setPhotoError('Photos couldn’t refresh. Please try again.'); }
  }, [repository]);
  useEffect(() => {
    const timer = setInterval(() => { void refreshPhotos(); }, 4 * 60 * 1000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refreshPhotos(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [refreshPhotos]);
  async function loadMore() {
    if (!hasMore || loading || loadingMoreRef.current) return;
    const request = requestRef.current; loadingMoreRef.current = true; setMoreLoading(true); setError('');
    try {
      const page = await repository.listItems({ categoryId, collectionId, search, page: pageRef.current + 1 });
      if (request !== requestRef.current) return;
      pageRef.current++; const seen = new Set(itemsRef.current.map(item => item.id)); const next = [...itemsRef.current, ...page.items.filter(item => !seen.has(item.id))]; itemsRef.current = next; setItems(next); setHasMore(page.hasMore); setTotal(page.total);
      try { const urls = await repository.readImages(page.items.map(item => item.id)); if (request === requestRef.current) setImages(current => ({ ...current, ...Object.fromEntries(urls.map(image => [image.itemId, image])) })); }
      catch { if (request === requestRef.current) setPhotoError('Some photos couldn’t load. Please retry.'); }
    } catch (e) { if (request === requestRef.current) setError(messageOf(e)); }
    finally { if (request === requestRef.current) { loadingMoreRef.current = false; setMoreLoading(false); } }
  }
  return { categories, collections, items, images, total, hasMore, loading, moreLoading, error, photoError, refresh, refreshPhotos, loadMore };
}
