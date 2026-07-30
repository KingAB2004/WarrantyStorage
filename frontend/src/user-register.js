import React from "react"
import { Link } from "react-router-dom";
import axios from 'axios'
import Navbar from "./navbar";
import './Login.css';

export default function Register(){
  const [formData, setFormData] = React.useState({
    username: '',
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault(); 
    try {
      await axios.post('http://localhost:5000/warranty/setup', formData);
      alert('Form submitted successfully!');
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Error submitting form.');
    }
  };
  
  return (
    <div className="login-wrapper">
      <Navbar />

      <div className="login-form-container">
        <div className="login-glass-card">
          <h2 className="login-heading">Sign Up</h2>

          <form onSubmit={handleSubmit} >
            <div className="login-form-group">
              <label htmlFor="username" className="login-label">Username</label>
              <input
                type="text"
                className="form-control login-form-control"
                id="username"
                name="username"  
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                required
                />
            </div>
            
            <div className="login-form-group">
              <label htmlFor="email" className="login-label">Email address</label>
              <input
                type="email"
                className="form-control login-form-control"
                id="email"
                name="email"  
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="login-form-group">
              <label htmlFor="password" className="login-label">Password</label>
              <input
                type="password"
                className="form-control login-form-control"
                id="password"
                name="password"  
                placeholder="Create a password"
                value={formData.password}
                onChange={handleChange}
                required
                />
            </div>
            
            <button type="submit" className="btn login-btn mt-3">
              Create Account
            </button>
          </form>
          
          <div className="text-center mt-4">
            <p style={{ color: 'rgba(255,255,255,0.6)'}}>
              Already have an account? <Link to="/login" className="login-link ms-1">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}