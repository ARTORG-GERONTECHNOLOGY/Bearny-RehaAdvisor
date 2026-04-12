// src/components/RootLayout.tsx
import React from 'react';
import LogoutListener from '@/LogoutListener';
import PatientDataBootstrap from '@/components/PatientDataBootstrap';

const RootLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <LogoutListener />
      <PatientDataBootstrap />
      {children}
    </>
  );
};

export default RootLayout;
