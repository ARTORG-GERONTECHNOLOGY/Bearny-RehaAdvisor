import React from 'react';
import PropTypes from 'prop-types';

export function Document({ children }) {
  return <div data-testid="mock-document">{children}</div>;
}
Document.propTypes = { children: PropTypes.node };

export function Page() {
  return <div data-testid="mock-page">Mock PDF Page</div>;
}
export const pdfjs = {
  GlobalWorkerOptions: {
    workerSrc: '',
  },
};
