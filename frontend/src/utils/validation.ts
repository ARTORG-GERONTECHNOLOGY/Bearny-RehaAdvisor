// utils/validation.ts

export const isValidName = (name: string) => {
  const nameRegex = /^[A-Za-z]+$/;
  return nameRegex.test(name);
};

export const validateForm = (formData: any) => {
  let valid = true;
  const newErrors = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    repeatPassword: '',
  };

  // Name validation (no numbers allowed)
  // Name validation (letters, spaces, and hyphens allowed)
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;

  if (!nameRegex.test(formData.firstName)) {
    newErrors.firstName = 'First name should only contain letters, spaces.';
    valid = false;
  }

  if (!nameRegex.test(formData.lastName)) {
    newErrors.lastName = 'Last name should only contain letters, spaces.';
    valid = false;
  }

  // Email validation (simple regex pattern)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!formData.email.match(emailRegex)) {
    newErrors.email = 'Invalid email address.';
    valid = false;
  }

  // Password validation (minimum 8 characters, at least 1 uppercase, 1 number, 1 special character)
  const passwordRegex = /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*\W)(?!.* ).{8,16}$/;
  if (!passwordRegex.test(formData.password)) {
    newErrors.password = formData.password;
    valid = false;
  }

  // Repeat password validation
  if (formData.password !== formData.repeatPassword) {
    newErrors.repeatPassword = 'Passwords do not match.';
    valid = false;
  }
  return {valid, newErrors};
};

const hasNonEmptyValue = (data : any) => {
  return Object.values(data).some(value => value !== '' && value !== null );
};


// @ts-ignore
export const validateCurrentStep = (formData: any, step: number) => {
  let newErrors = {};

// Step 1 validation (common for all user types)
  let validity = true
  // Loop through each key-value pair in the formData
  Object.entries(formData).forEach(([key, value]) => {
       if (value === '' || value === null || value === undefined) {
         // If value is empty, set an error message
         console.log(value)
         // @ts-ignore
         newErrors[key] = `${key} cannot be empty`;
         validity = false;
       }
    });
  return {validity, newErrors};
};
