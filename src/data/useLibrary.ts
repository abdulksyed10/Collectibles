import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useRepository } from './RepositoryProvider';
import type { Collection, Pin, PinImage } from '../domain/models';
import { messageOf } from '../components/ui';
export function useLibrary(collectionId: string | undefined, search: string) {
  const repository = useRepository();
  const [collections, setCollections] = useState<Collection[]>([]); const [pins, setPins] = useState<Pin[]>([]); const [images, setImages] = useState<Record<string, PinImage>>({});
  const [total, setTotal] = useState(0); const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true); const [moreLoading, setMoreLoading] = useState(false); const [error, setError] = useState(''); const [photoError, setPhotoError] = useState(''); const [revision, setRevision] = useState(0);
  const pageRef = useRef(0); const requestRef = useRef(0); const pinsRef = useRef<Pin[]>([]); const loadingMoreRef = useRef(false);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    const request = ++requestRef.current; setLoading(true); setError(''); setPhotoError(''); setImages({}); setPins([]); pinsRef.current = []; pageRef.current = 0; loadingMoreRef.current = false; setMoreLoading(false);
    Promise.all([repository.listCollections(), repository.listPins({ collectionId, search, page: 0 })]).then(async ([nextCollections, page]) => {
      if (request !== requestRef.current) return;
      setCollections(nextCollections); setPins(page.pins); pinsRef.current = page.pins; setTotal(page.total); setHasMore(page.hasMore); setLoading(false);
      try { const urls = await repository.readImages(page.pins.map(pin => pin.id)); if (request === requestRef.current) setImages(Object.fromEntries(urls.map(image => [image.pinId, image]))); }
      catch { if (request === requestRef.current) setPhotoError('Photos couldn’t load. Your pin details are still here.'); }
    }).catch(e => { if (request === requestRef.current) { setError(messageOf(e)); setLoading(false); } });
    return () => { requestRef.current++; };
  }, [collectionId, search, revision, repository]);
  const refreshPhotos = useCallback(async () => {
    const request = requestRef.current;
    try { const urls = await repository.readImages(pinsRef.current.map(pin => pin.id)); if (request === requestRef.current) { setImages(Object.fromEntries(urls.map(image => [image.pinId, image]))); setPhotoError(''); } }
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
      const page = await repository.listPins({ collectionId, search, page: pageRef.current + 1 });
      if (request !== requestRef.current) return;
      pageRef.current++; const seen = new Set(pinsRef.current.map(pin => pin.id)); const next = [...pinsRef.current, ...page.pins.filter(pin => !seen.has(pin.id))]; pinsRef.current = next; setPins(next); setHasMore(page.hasMore); setTotal(page.total);
      try { const urls = await repository.readImages(page.pins.map(pin => pin.id)); if (request === requestRef.current) setImages(current => ({ ...current, ...Object.fromEntries(urls.map(image => [image.pinId, image])) })); }
      catch { if (request === requestRef.current) setPhotoError('Some photos couldn’t load. Please retry.'); }
    } catch (e) { if (request === requestRef.current) setError(messageOf(e)); }
    finally { if (request === requestRef.current) { loadingMoreRef.current = false; setMoreLoading(false); } }
  }
  return { collections, pins, images, total, hasMore, loading, moreLoading, error, photoError, refresh, refreshPhotos, loadMore };
}
