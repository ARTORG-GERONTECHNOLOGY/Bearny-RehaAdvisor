import { Icon } from 'react-icons-kit';
import { eyeOff } from 'react-icons-kit/feather/eyeOff';
import { eye } from 'react-icons-kit/feather/eye';

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggle: () => void;
  pagetype: 'regular' | 'patient'; // Adding pagetype to determine the page type
}

const PasswordField: React.FC<PasswordFieldProps> = ({
                                                       id, value, onChange, showPassword, onToggle, pagetype,
                                                     }) => (
  <div className="mb-3 position-relative">
    <label htmlFor={id} className="form-label">
      {pagetype === 'patient' ? 'Access Word' : 'Password'}
    </label>

    <input
      // If pagetype is 'patient', set the type to 'text', else toggle based on showPassword state
      type={pagetype === 'patient' ? 'text' : (showPassword ? 'text' : 'password')}
      className="form-control"
      id={id}
      placeholder={pagetype === 'patient' ? 'Enter Access Word' : 'Enter Password'}
      value={value}
      onChange={onChange}
      required
    />

    {/* Only show the toggle icon if it is not a patient page */}
    {pagetype !== 'patient' && (
      <span
        className="position-absolute end-0 top-50 translate-middle-y me-3"
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        aria-label="Toggle password visibility"
      >
        {/* Toggle between eye and eyeOff icons based on the showPassword state */}
        <Icon icon={showPassword ? eyeOff : eye} size={20} />
      </span>
    )}
  </div>
);

export default PasswordField;
