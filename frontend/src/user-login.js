import './Login.css';
import React from 'react';
import axios from "axios";
import { useNavigate } from "react-router-dom"; 
import bcrypt, { compare, compareSync } from 'bcryptjs';
import Navbar from './navbar';

function Login() {
const navigate =useNavigate();
  const [formData, setFormData] = React.useState({
    email: "",
    password: "",
    isMerchant:false
  });
  const [err ,checkerr] =React.useState(false);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [id]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const task = await axios.post("http://localhost:5000/warranty/setup/id", formData);
      const check =compareSync(formData.password ,task.data.hashed)
      if(check)
        {
      if(!formData.isMerchant)
      {
            const token = task.data.token;
            localStorage.setItem("jwt_token", token);
            localStorage.setItem("Data" ,formData.email)
            navigate("/UserEdit");
            
            console.log("done")
          }
          else
          {
            const token = task.data.token;
            localStorage.setItem("jwt_token", token);
            localStorage.setItem("Data" ,formData.email)
            localStorage.setItem("SN", task.data.StoreName);
            localStorage.setItem("SA" ,task.data.StoreLocation)
            localStorage.setItem("WN" ,task.data.WorkNumber);
            navigate("/Currentwarrantylist");
            
          }
        }
        
        } catch (error) {
          checkerr(1);
        }
  };

  return (
    <div className="login-wrapper">
      <Navbar />
      
      <div className="login-form-container">
        <div className="login-glass-card">
          <h2 className="login-heading">Sign In</h2>
          
          <form onSubmit={handleSubmit}>
            <div className="login-form-group">
              <label htmlFor="email" className="login-label">Email address</label>
              <input
                type="email"
                className="form-control login-form-control"
                id="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email"
                required
              />
            </div>

            <div className="login-form-group">
              <label htmlFor="password" className="login-label">Password</label>
              <input
                type="password"
                className="form-control login-form-control"
                id="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
                />
            </div>
              
            <div className="login-form-group form-check d-flex align-items-center mt-3">
              <input
                type="checkbox"
                className="form-check-input me-2"
                id="isMerchant"
                checked={formData.isMerchant} 
                onChange={() =>
                  setFormData((prevData) => ({
                    ...prevData,
                    isMerchant: !prevData.isMerchant, 
                  }))
                }
              />
              <label htmlFor="isMerchant" className="form-check-label" style={{ color: 'rgba(255,255,255,0.7)' }}>
                I am signing in as a Merchant
              </label>
            </div>

            <div className="d-flex justify-content-end mb-4">
              <a href="/ForgotPassword" className="login-link text-sm" style={{ fontSize: '0.9rem' }}>Forgot Password?</a>
            </div>

            <button type="submit" className="btn login-btn">
              Authenticate
            </button>
          </form>

          {err ? (
            <div className="login-error">
              Invalid credentials provided. Please try again.
            </div>
          ) : null}
          
          <div className="text-center mt-4">
              <p style={{ color: 'rgba(255,255,255,0.6)'}}>
                Not registered yet? <a href="/RegisterMerchant" className="login-link ms-1">Create Account</a>
              </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
