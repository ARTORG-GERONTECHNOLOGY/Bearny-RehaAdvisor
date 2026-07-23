import React from 'react';

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function Container({ children, className = '' }: ContainerProps) {
  return (
    <main className={`container mx-auto max-w-[90%] xl:max-w-screen-xl ${className}`}>
      {children}
    </main>
  );
}
