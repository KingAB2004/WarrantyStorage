import React, { useState, useEffect, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useNavigate } from "react-router-dom";
import { colors } from '@mui/material';
import axios from "axios";

import Navbar from './navbar';
import './Login.css';

function OTPVerification() {
    const [otp, setOtp] = useState('');
    const [generatedOtp, setGeneratedOtp] = useState(null); 
    const [Wrong, setWrong] = useState(false);
    const navigate = useNavigate();
    const email = localStorage.getItem("email");
    const hasFetched = useRef(false);
    
    const sendMail = async() => {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        setGeneratedOtp(randomNum);
        try {
            await axios.post("http://localhost:5000/warranty/setup/OTP", {
                email: email,
                num: randomNum
            });
        } catch (error) {
            console.error("OTP send failed: ", error);
        }
    }

    useEffect(() => {
        if (!hasFetched.current) {
            sendMail();
            hasFetched.current = true;
        }
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if(generatedOtp === parseInt(otp)) {
            localStorage.setItem("verifiedOtp", otp);
            navigate("/ChangePassword");
        } else {
            setWrong(true);
        }
    };

    return (
        <div className="login-wrapper">
            <Navbar />
            
            <div className="login-form-container">
                <div className="login-glass-card">
                    <h2 className="login-heading">OTP Verification</h2>
                    <p className="text-center mb-4" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                        Please enter the 4-digit OTP sent to your registered email.
                    </p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="login-form-group">
                            <input
                                type="text"
                                name="otp"
                                className="form-control login-form-control text-center"
                                placeholder="- - - -"
                                maxLength="4"
                                style={{ fontSize: '2rem', letterSpacing: '0.5rem' }}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                required
                            />
                        </div>
                        
                        <button type="submit" className="btn login-btn mt-3">
                            Verify Identity
                        </button>
                    </form>

                    {Wrong && (
                        <div className="login-error mt-4">
                            The OTP you entered is incorrect.
                        </div>
                    )}

                    <div className="text-center mt-4 pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.05) !important' }}>
                        <p className="mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Didn't receive the OTP?</p>
                        <button type="button" className="btn btn-link login-link p-0 text-decoration-none" onClick={() => sendMail()}>
                            Resend Code
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default OTPVerification;