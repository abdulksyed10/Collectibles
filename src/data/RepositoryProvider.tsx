import { createContext, useContext } from 'react';
import type { CollectionRepository } from '../domain/models';

const RepositoryContext = createContext<CollectionRepository | null>(null);
export const RepositoryProvider = RepositoryContext.Provider;
export function useRepository() {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('A collection repository is required.');
  return repository;
}
