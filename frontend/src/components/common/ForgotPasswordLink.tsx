import React from 'react';

interface ForgotPasswordLinkProps {
  onClick: () => void;
  text?: string; // Optional override for link text
}

const ForgotPasswordLink: React.FC<ForgotPasswordLinkProps> = ({
  onClick,
  text = 'Forgot Password?',
}) => (
  <div className="mt-3 text-center">
    <button
      type="button"
      className="text-sm underline px-0 !text-brand"
      onClick={onClick}
      aria-label={text}
    >
      {text}
    </button>
  </div>
);

export default ForgotPasswordLink;
