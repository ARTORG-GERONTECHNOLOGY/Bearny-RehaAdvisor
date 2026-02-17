import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../../test-utils/renderWithRouter';
import ChangePasswordForm from '../ChangePasswordForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../common/ErrorAlert', () => ({
  __esModule: true,
  default: ({ message, onClose }: any) => (
    <div role="alert">
      <span>{message}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

const storeMock = {
  saving: false,
  errorBanner: '',
  changePassword: jest.fn(async () => {}),
};

jest.mock('../../../stores/userProfileStore', () => ({
  __esModule: true,
  default: storeMock,
}));

jest.mock('react-bootstrap', () => ({
  Form: Object.assign(
    ({ children, onSubmit, ...rest }: any) => (
      <form onSubmit={onSubmit} {...rest}>
        {children}
      </form>
    ),
    {
      Group: ({ children }: any) => <div>{children}</div>,
      Label: ({ children }: any) => <label>{children}</label>,
      Control: ({ value, onChange, disabled, type }: any) => (
        <input type={type} value={value} onChange={onChange} disabled={disabled} />
      ),
    }
  ),
  InputGroup: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled, type }: any) => (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeMock.saving = false;
    storeMock.errorBanner = '';
  });

  it('shows local validation error for missing old password', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your old password.');
    expect(storeMock.changePassword).not.toHaveBeenCalled();
  });

  it('shows local validation error for password mismatch', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    const inputs = screen.getAllByRole('textbox'); // because mocked input is plain input; password isn't "textbox" in real DOM
    // In our mock, inputs are normal <input>, which RTL treats as textbox.
    // order: old, new, confirm
    fireEvent.change(inputs[0], { target: { value: 'oldpwd' } });
    fireEvent.change(inputs[1], { target: { value: 'newpassword' } });
    fireEvent.change(inputs[2], { target: { value: 'different' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('New passwords do not match!');
    expect(storeMock.changePassword).not.toHaveBeenCalled();
  });

  it('submits valid data and calls store.changePassword', async () => {
    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'oldpwd123' } });
    fireEvent.change(inputs[1], { target: { value: 'newpassword' } }); // >=8
    fireEvent.change(inputs[2], { target: { value: 'newpassword' } });

    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    await waitFor(() => {
      expect(storeMock.changePassword).toHaveBeenCalledWith('oldpwd123', 'newpassword');
    });
  });

  it('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    renderWithRouter(<ChangePasswordForm onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables buttons when store.saving=true', () => {
    storeMock.saving = true;

    renderWithRouter(<ChangePasswordForm onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // saving label shows
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
