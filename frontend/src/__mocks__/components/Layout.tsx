import React from 'react';

type LayoutProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

const MockLayout = ({ children, ...rest }: LayoutProps) => (
  <div data-testid="layout" {...rest}>
    {children}
  </div>
);

MockLayout.displayName = 'Layout';

export default MockLayout;
