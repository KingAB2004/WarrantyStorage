import React from "react"
import './RegisterMerchant.css';    
import {Link} from 'react-router-dom'
import axios from "axios";
import Navbar from "./navbar";
function RegisterMerchant({ togglePage }) {

  const [formData, setFormData] = React.useState({
    business_name: "",
    your_name: "",
    work_email: "",
    alt_phone: "",
    work_phone: "",
    business_add: "",
    business_type: "",
    password: "",
    confirm_password: "",
    terms: false,
  });

  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [id]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('http://localhost:5000/warranty/setup/addmerchant', formData);
      alert('Registration successful!');
      localStorage.setItem("IsClient" ,"NO");
      localStorage.setItem("Data" ,formData.work_email)
    } catch (error) {
      console.error('Error registering:', error);  
      alert('Error registering. Please try again.');
    }
  };
    return (
      <div className="merchant-register-wrapper">
        <Navbar />

        <div className="merchant-form-container">
          <div className="merchant-glass-card">
            <h2 className="merchant-heading">Merchant Registration</h2>

            <form onSubmit={handleSubmit}>
              <div className="row">
                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="business_name" className="merchant-label">Business Name</label>
                  <input
                    type="text"
                    className="form-control merchant-form-control"
                    id="business_name"
                    value={formData.business_name}
                    onChange={handleChange}
                    placeholder="Enter your business name"
                    required
                  />
                </div>

                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="your_name" className="merchant-label">Your Name</label>
                  <input
                    type="text"
                    className="form-control merchant-form-control"
                    id="your_name"
                    value={formData.your_name}
                    onChange={handleChange}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="work_email" className="merchant-label">Work Email</label>
                  <input
                    type="email"
                    className="form-control merchant-form-control"
                    id="work_email"
                    value={formData.work_email}
                    onChange={handleChange}
                    placeholder="Enter your work email"
                    required
                  />
                </div>

                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="business_add" className="merchant-label">Business Address</label>
                  <input
                    type="text"
                    className="form-control merchant-form-control"
                    id="business_add"
                    value={formData.business_add}
                    onChange={handleChange}
                    placeholder="Enter your business address"
                    required
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="work_phone" className="merchant-label">Work Phone</label>
                  <input
                    type="text"
                    className="form-control merchant-form-control"
                    id="work_phone"
                    value={formData.work_phone}
                    onChange={handleChange}
                    placeholder="Enter work phone number"
                    required
                  />
                </div>

                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="alt_phone" className="merchant-label">Alternate Phone</label>
                  <input
                    type="text"
                    className="form-control merchant-form-control"
                    id="alt_phone"
                    value={formData.alt_phone}
                    onChange={handleChange}
                    placeholder="Enter alternate phone number"
                    required
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-12 merchant-form-group">
                  <label htmlFor="business_type" className="merchant-label">Business Type</label>
                  <select
                    className="form-select merchant-form-control"
                    id="business_type"
                    value={formData.business_type}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>Select Business Type</option>
                    <option value="Retail">Retail</option>
                    <option value="Service">Service</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Consulting">Consulting</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="password" className="merchant-label">Password</label>
                  <input
                    type="password"
                    className="form-control merchant-form-control"
                    id="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    required
                  />
                </div>

                <div className="col-md-6 merchant-form-group">
                  <label htmlFor="confirm_password" className="merchant-label">Confirm Password</label>
                  <input
                    type="password"
                    className="form-control merchant-form-control"
                    id="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    required
                  />
                </div>
              </div>

              <div className="merchant-form-group form-check mt-3 mb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="terms"
                  checked={formData.terms}
                  onChange={handleChange}
                  required
                />
                <label className="form-check-label merchant-check-label" htmlFor="terms">
                  I agree to the Terms and Conditions
                </label>
              </div>

              <button type="submit" className="btn merchant-btn">
                Register as Merchant
              </button>
            </form>
            
            <div className="text-center mt-4">
              <p style={{ color: 'rgba(255,255,255,0.6)'}}>
                Already have an account? <Link to="/Login" className="merchant-link ms-1">Sign In</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  export default RegisterMerchant;
  
