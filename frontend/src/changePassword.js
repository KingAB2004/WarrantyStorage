import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from "react-router-dom"; 
import axios from 'axios';
import Navbar from './navbar';
import './Login.css';

function ChangePassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [Wrong, setWrong] = useState(false);
    const navigate =useNavigate();

    const handleSubmit = async(e) => {
        e.preventDefault();
        if (password === confirmPassword) {
            setWrong(false);
            try {
                const email = await localStorage.getItem("email");
                const otpCode = await localStorage.getItem("verifiedOtp");
                const task = await axios.post("http://localhost:5000/warranty/setup/UpdatePassword", {
                    email: email,
                    password: confirmPassword,
                    otp: otpCode
                });
                alert('Password changed successfully');
                navigate("/login");
            } catch (error) {
                console.error("Failed to update password:", error);
                alert("Server rejected the new password. Ensure your session hasn't expired.");
            }
        } else {
            console.error('Passwords do not match');
            setWrong(true);
        }
    };

    return (
        <div className="login-wrapper">
            <Navbar />
            <div className="login-form-container">
                <div className="login-glass-card">
                    <h2 className="login-heading">Set New Password</h2>
                    <p className="text-center mb-4" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        Securely enter and confirm your new password below.
                    </p>
                    <form onSubmit={handleSubmit}>
                        <div className="login-form-group">
                            <input
                                type="password"
                                name="password"
                                className="form-control login-form-control"
                                placeholder="New Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="login-form-group">
                            <input
                                type="password"
                                name="confirmPassword"
                                className="form-control login-form-control"
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="btn login-btn mt-3">
                            Confirm Change
                        </button>
                    </form>
                    
                    {Wrong && (
                        <div className="login-error mt-4">
                            Passwords do not match. Please try again.
                        </div>
                    )}
                    
                </div>
            </div>
        </div>
    );
}

export default ChangePassword;
