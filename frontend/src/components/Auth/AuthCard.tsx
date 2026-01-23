import React from 'react';

type Props = {
  title: React.ReactNode;
  children: React.ReactNode;
};

const AuthCard: React.FC<Props> = ({ title, children }) => {
  return (
    <div className="p-4 shadow-sm bg-white rounded">
      <h2 className="text-center mb-4">{title}</h2>
      {children}
    </div>
  );
};

export default AuthCard;
