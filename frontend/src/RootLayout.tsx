// src/components/RootLayout.tsx
import React from 'react';
import LogoutListener from './LogoutListener';

const RootLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <LogoutListener /> {/* ✅ Listener is now always active */}
      {children}
    </>
  );
};

export default RootLayout;
