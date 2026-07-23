export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPhone = (phone: string): boolean => /^\+?[0-9]{7,15}$/.test(phone);

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  repeatPassword: string;
  [key: string]: string; // for dynamic key handling
}

export const validateForm = (
  formData: FormData
): { valid: boolean; newErrors: Record<string, string> } => {
  let valid = true;

  const newErrors: Record<string, string> = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    repeatPassword: '',
  };

  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex = /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*\W)(?!.* ).{8,16}$/;

  if (!nameRegex.test(formData.firstName)) {
    newErrors.firstName = 'First name should only contain letters and spaces.';
    valid = false;
  }

  if (!nameRegex.test(formData.lastName)) {
    newErrors.lastName = 'Last name should only contain letters and spaces.';
    valid = false;
  }

  if (!emailRegex.test(formData.email)) {
    newErrors.email = 'Invalid email address.';
    valid = false;
  }

  if (!passwordRegex.test(formData.password)) {
    newErrors.password =
      'Password must be 8-16 characters, include upper/lowercase letters, a number, and a special character.';
    valid = false;
  }

  if (formData.password !== formData.repeatPassword) {
    newErrors.repeatPassword = 'Passwords do not match.';
    valid = false;
  }

  return { valid, newErrors };
};
