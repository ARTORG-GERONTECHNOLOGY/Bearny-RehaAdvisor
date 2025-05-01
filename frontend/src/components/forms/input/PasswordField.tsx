import { FaEye, FaEyeSlash } from 'react-icons/fa';

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggle: () => void;
  pagetype: 'regular' | 'patient'; // Adding pagetype to determine the page type
}

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  value,
  onChange,
  showPassword,
  onToggle,
  pagetype,
}) => (
  <div className="mb-3 position-relative">
    <label htmlFor={id} className="form-label">
      {pagetype === 'patient' ? 'Access Word' : 'Password'}
    </label>

    <div className="position-relative">
      <input
        type={pagetype === 'patient' ? 'text' : showPassword ? 'text' : 'password'}
        className="form-control"
        id={id}
        placeholder={pagetype === 'patient' ? 'Enter Access Word' : 'Enter Password'}
        value={value}
        onChange={onChange}
        required
      />

      {/* Only show the toggle icon if it's not a patient page */}
      {pagetype !== 'patient' && (
        <button
          type="button"
          className="position-absolute end-0 top-50 translate-middle-y me-3 border-0 bg-transparent"
          onClick={onToggle}
          style={{ cursor: 'pointer' }}
          aria-label="Toggle password visibility"
        >
          {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
        </button>
      )}
    </div>
  </div>
);

export default PasswordField;
