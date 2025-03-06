import React, { useState } from "react";
import { Form, Button, Modal } from "react-bootstrap";
import Select from "react-select";
import config from '../../config/config.json';

const EditUserInfo = ({ userData, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    ...userData,
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [error, setError] = useState("");
  

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiSelectChange = (selectedOptions, fieldName) => {
    const selectedValues = selectedOptions ? selectedOptions.map(option => option.value) : [];
    setFormData(prev => ({ ...prev, [fieldName]: selectedValues }));
  };

  const validateInputs = () => {
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Invalid email format.");
      return false;
    }
    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone)) {
      setError("Invalid phone number format.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = (e) => {
    if (!validateInputs()) return;
    e.preventDefault();
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      alert("New passwords do not match!");
      return;
    }
    onSave(formData);
  };

  return (
    <>
        <Form onSubmit={handleSubmit}>
          {error && <p className="text-danger">{error}</p>}
          {config.TherapistForm.flatMap(section => section.fields)
            .filter(field => !["password", "repeatPassword", "oldPassword", "newPassword", "confirmPassword", "userType"].includes(field.be_name))
            .map((field) => (
              <div key={config.UserProfile[field.label]} className="mb-3">
                <Form.Label htmlFor={config.UserProfile[field.label]}>{field.label}</Form.Label>
                {field.type === "multi-select" ? (
                  <Select
                    id={field.be_name}
                    isMulti
                    options={field.options.map(option => ({ value: option, label: option }))}
                    onChange={(selectedOptions) => handleMultiSelectChange(selectedOptions, field.be_name)}
                    defaultValue={formData[field.be_name]?.map(value => ({ value, label: value })) || []}
                  />
                ) : (
                  <Form.Control
                    type={field.type}
                    id={field.be_name}
                    defaultValue={formData[field.be_name] || []}
                    onChange={handleChange}
                    disabled={field.be_name === "email"}
                  />
                )}
              </div>
            ))}

          <h5>Change Password</h5>
          <Form.Group className="mb-3">
            <Form.Label>Old Password</Form.Label>
            <Form.Control type="password" name="oldPassword" value={formData.oldPassword} onChange={handleChange} />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>New Password</Form.Label>
            <Form.Control type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Confirm New Password</Form.Label>
            <Form.Control type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} />
          </Form.Group>

          <div className="d-flex justify-content-between">
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary">Save Changes</Button>
          </div>
        </Form>
        </>
  );
};

export default EditUserInfo;