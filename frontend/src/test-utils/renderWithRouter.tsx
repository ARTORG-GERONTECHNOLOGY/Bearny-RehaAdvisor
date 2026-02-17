import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Options = {
  route?: string;
};

export function renderWithRouter(ui: React.ReactElement, options: Options = {}) {
  const { route = '/' } = options;

  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
