import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from "react-router-dom"; 
import Navbar from './navbar';
import './Login.css';

function ForgotPassword() {
    const navigate =useNavigate();
    
    const [userDetail, setUserDetail] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        localStorage.setItem("email", userDetail);
        let randint = Math.floor(1000 + Math.random() * 9000);
        navigate("/OTP");
    };

    return (
        <div className="login-wrapper">
            <Navbar />
            
            <div className="login-form-container">
                <div className="login-glass-card">
                    <h2 className="login-heading">Forgot Password</h2>
                    <p className="text-center mb-4" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        Enter your email address to reset your password.
                    </p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="login-form-group">
                            <label className="login-label">Email Address</label>
                            <input
                                type="email"
                                name="userDetail"
                                className="form-control login-form-control"
                                placeholder="Enter your email"
                                value={userDetail}
                                onChange={(e) => setUserDetail(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="btn login-btn mt-3">
                            Reset Password
                        </button>
                    </form>
                    
                    <div className="text-center mt-4 pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.05) !important' }}>
                        <a href="/login" className="login-link">Back to Sign In</a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword;
