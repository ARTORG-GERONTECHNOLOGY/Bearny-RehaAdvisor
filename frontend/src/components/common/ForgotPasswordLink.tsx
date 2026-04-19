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
      className="btn btn-link btn-sm text-decoration-underline px-0 !text-[#00956C]"
      onClick={onClick}
      aria-label={text}
    >
      {text}
    </button>
  </div>
);

export default ForgotPasswordLink;
