import React from "react"
import kingAB from "./assets/AB.png"
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import Register from './user-register'
import { Link } from "react-router-dom";
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from "./navbar";
import Footer from "./Footer";
import './FrontPage.css';
import { Devices, FolderSpecial, Security, ThumbUp, Cloud, Search, Smartphone, NotificationsActive } from "@mui/icons-material";

export default function FrontPage(props){
  const navigate = useNavigate();
  return (
    <div className="frontpage-wrapper">
      <Navbar />
      <div className="frontpage-hero">
        <h1>Warranty Storage</h1>
        <p>
          Store and manage all your product warranties in one secure, mobile-friendly platform. Easily upload, organize, and access warranty information anytime, anywhere. Built with modern web technologies for fast and reliable service.
        </p>
        <div className="d-flex justify-content-center gap-3">
          <button type="button" className="hero-btn hero-btn-primary" onClick={() => navigate('/RegisterUser')}>
            Client Access
          </button>
          <button type="button" className="hero-btn hero-btn-outline" onClick={() => navigate('/RegisterMerchant')}>
            Merchant Access
          </button>
        </div>
      </div>

      <div className="features-section">
        <div className="container">
          <h2 className="features-title">Features</h2>
          <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-4 g-4">
            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Devices className="feature-icon" />
                </div>
                <h3>Easy Access</h3>
                <p>Access all warranty information from any device, anytime.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <FolderSpecial className="feature-icon" />
                </div>
                <h3>Accurate Organization</h3>
                <p>Automatically categorize warranties for quick retrieval.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Security className="feature-icon" />
                </div>
                <h3>Official and Secure</h3>
                <p>Data is securely stored with robust encryption.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <ThumbUp className="feature-icon" />
                </div>
                <h3>User-Friendly Interface</h3>
                <p>Intuitive design for easy navigation and use.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Cloud className="feature-icon" />
                </div>
                <h3>Cloud-Based Storage</h3>
                <p>Cloud storage for easy backup and retrieval.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Search className="feature-icon" />
                </div>
                <h3>Search Functionality</h3>
                <p>Quickly find warranties using product names or categories.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <Smartphone className="feature-icon" />
                </div>
                <h3>Responsive Design</h3>
                <p>Optimized for all screen sizes, from mobile to desktop.</p>
              </div>
            </div>

            <div className="col">
              <div className="feature-card">
                <div className="feature-icon-wrapper">
                  <NotificationsActive className="feature-icon" />
                </div>
                <h3>Custom Reminders</h3>
                <p>Set reminders for warranty expiration and renewal dates.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  )
}