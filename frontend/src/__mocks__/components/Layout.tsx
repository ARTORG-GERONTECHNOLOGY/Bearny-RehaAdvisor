import React from 'react';

type LayoutProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

const MockLayout = ({ children, title, subtitle, ...rest }: LayoutProps) => (
  <div data-testid="layout" {...rest}>
    {title && <h1>{title}</h1>}
    {subtitle && <h2>{subtitle}</h2>}
    {children}
  </div>
);

MockLayout.displayName = 'Layout';

export default MockLayout;
