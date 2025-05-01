interface ForgotPasswordLinkProps {
  onClick: () => void;
  text?: string; // Optional text prop
}

const ForgotPasswordLink: React.FC<ForgotPasswordLinkProps> = ({
  onClick,
  text = 'Forgot Password?',
}) => (
  <div className="mt-3">
    <button type="button" className="btn btn-link" onClick={onClick}>
      {text} {/* Use the passed text or default to "Forgot Password?" */}
    </button>
  </div>
);

export default ForgotPasswordLink;
