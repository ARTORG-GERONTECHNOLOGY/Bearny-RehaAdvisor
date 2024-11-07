import React, { useState } from 'react';
import authStore from '../../stores/authStore'
import Select from 'react-select'

// @ts-ignore
const EditUserInfo = ({ userData, onSave, onCancel }) => {
  const [formData, setFormData] = useState(userData);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(formData); // Save the updated user data
  };

  const options = [
    { value: 'chocolate', label: 'Chocolate' },
    { value: 'strawberry', label: 'Strawberry' },
    { value: 'vanilla', label: 'Vanilla' }
  ]

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded shadow-sm bg-light">
      {/* Name Field */}
      <div className="form-group mb-3">
        <label htmlFor="name" className="form-label">Name</label>
        <input
          type="text"
          className="form-control"
          id="name"
          name="name"
          placeholder="Enter full name"
          value={formData.name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group mb-3">
        <label htmlFor="first_name" className="form-label">First Name</label>
        <input
          type="text"
          className="form-control"
          id="first_name"
          name="first_name"
          placeholder="Enter first name"
          value={formData.first_name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-group mb-3">
        <label htmlFor="pwd" className="form-label">Phone</label>
        <input
          type="text"
          className="form-control"
          id="phone"
          name="phone"
          value={formData.phone}
          onChange={handleChange}
          required
        />
      </div>

      {/* Email Field */}
      <div className="form-group mb-3">
        <label htmlFor="email" className="form-label">Email</label>
        <input
          type="email"
          className="form-control"
          id="email"
          name="email"
          placeholder="Enter email"
          value={formData.email}
          onChange={handleChange}
          required
        />
      </div>

      {/* Conditionally Rendered Fields for User Types */}
      {authStore.userType === 'patient' && (
        <div className="form-group mb-3">
          <label htmlFor="lifeGoals" className="form-label">Life Goals</label>
          <input
            type="text"
            className="form-control"
            id="lifeGoals"
            name="lifeGoals"
            placeholder="Enter life goals (comma-separated)"
            value={formData.lifeGoals.join(', ')}
            onChange={(e) => setFormData({ ...formData, lifeGoals: e.target.value.split(', ') })}
          />
        </div>
      )}

      {authStore.userType === 'therapist' && (
        <div className="form-group mb-3">
          <label htmlFor="specialisation" className="form-label">Specialisation</label>
          <Select
            closeMenuOnSelect={true}
            options={options}
            placeholder="Enter specialization"
            value={formData.specialisation || null} // Use null for uncontrolled component
            id="specialisation"
            name="specialisation" // Add name attribute
            onChange={(selectedOption) => {
              setFormData({ ...formData, specialisation: selectedOption });
            }}
            required={true}
          />
        </div>
      )}

      {authStore.userType === 'therapist' && (
        <div className="form-group mb-3">
          <label htmlFor="clinics" className="form-label">Clinics</label>
          <Select
            closeMenuOnSelect={true}
            options={options}
            placeholder="Enter clinics"
            value={formData.clinics || null} // Use null for uncontrolled component
            id="clinics"
            name="clinics" // Add name attribute
            onChange={(selectedOption) => {
              setFormData({ ...formData, clinics: selectedOption });
            }}
            required={true}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="d-flex justify-content-between mt-4">
        <button type="submit" className="btn btn-success px-4">
          Save Changes
        </button>
        <button type="button" className="btn btn-secondary px-4" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>

  );
};

export default EditUserInfo;
