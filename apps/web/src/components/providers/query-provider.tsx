"use client"

import { useState, type ReactNode } from "react"
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval"

import { AUTHENTICATED_READ_STALE_TIME_MS } from "@/lib/query/policy"

// Bump when the cached query shape changes so old deploys' caches are dropped.
const APP_CACHE_VERSION = "2"

const idbStorage = {
  getItem: (key: string) => idbGet<string>(key).then((v) => v ?? null),
  setItem: (key: string, value: string) => idbSet(key, value),
  removeItem: (key: string) => idbDel(key),
}

/**
 * Persisted, user-scoped React Query provider.
 *
 * Security constraint: the persisted cache is namespaced by `userId` (storage
 * key + buster). Switching accounts uses a different IndexedDB key, so account
 * A can never read account B's cached project data. Bumping APP_CACHE_VERSION
 * busts every user's cache after a deploy that changes cached shapes.
 */
export function QueryProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: AUTHENTICATED_READ_STALE_TIME_MS,
            gcTime: 1000 * 60 * 60 * 24, // 24h — survives in IndexedDB
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  const [persister] = useState(() =>
    createAsyncStoragePersister({
      storage: idbStorage,
      key: `relay-rq-cache:${userId}`,
      throttleTime: 1000,
    }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24, // 24h
        buster: `${APP_CACHE_VERSION}:${userId}`,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
