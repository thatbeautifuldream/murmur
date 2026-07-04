import type { ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClientInstance, queryPersister } from "./query-client";

type TReactQueryProviderProps = {
  children: ReactNode;
};

export function ReactQueryProvider({ children }: TReactQueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClientInstance}
      persistOptions={{ persister: queryPersister }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
