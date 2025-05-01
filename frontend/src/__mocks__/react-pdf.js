import React from 'react';

export const Document = ({ children }) => <div data-testid="mock-document">{children}</div>;
export const Page = () => <div data-testid="mock-page">Mock PDF Page</div>;
export const pdfjs = {
  GlobalWorkerOptions: {
    workerSrc: '',
  },
};
