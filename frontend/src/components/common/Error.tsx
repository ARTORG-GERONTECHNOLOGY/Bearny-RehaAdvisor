import React from 'react';
import { Container } from 'react-bootstrap';

const Error: React.FC = () => {
  return (
    <Container
      className="p-4 d-flex flex-column align-items-center justify-content-center min-vh-50"
      role="alert"
    >
      <h3 className="text-center text-danger fs-3 fw-semibold">Error</h3>
      <p className="text-center text-muted fs-6">
        Something went wrong. Please try again later.
      </p>
    </Container>
  );
};

export default Error;
