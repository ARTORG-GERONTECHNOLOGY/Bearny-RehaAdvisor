// src/stores/StoreProvider.tsx
import React, { createContext, useContext } from 'react';
import { rootStore } from './rootStore';

const StoreContext = createContext(rootStore);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StoreContext.Provider value={rootStore}>{children}</StoreContext.Provider>
);

export const useStores = () => useContext(StoreContext);
