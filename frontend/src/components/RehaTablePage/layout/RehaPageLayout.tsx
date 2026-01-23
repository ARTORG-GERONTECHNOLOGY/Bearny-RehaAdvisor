// src/components/RehaTablePage/layout/RehaPageLayout.tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
}

const RehaPageLayout: React.FC<Props> = ({ children }) => {
  return <div className="rehaLayout">{children}</div>;
};

export default RehaPageLayout;
