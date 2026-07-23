import React from 'react';
import { Link } from 'react-router-dom';

interface ForgotPasswordLinkProps {
  to: string;
  text: string;
}

const ForgotPasswordLink: React.FC<ForgotPasswordLinkProps> = ({ to, text }) => (
  <div className="mt-3 text-center">
    <Link to={to} className="text-sm underline text-brand">
      {text}
    </Link>
  </div>
);

export default ForgotPasswordLink;
