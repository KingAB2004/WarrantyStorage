import kingAB from "./assets/AB.png"
import { Link } from "react-router-dom";
import './Navbar.css';

export default function Navbar() {
    return (
        <nav className="navbar navbar-expand-lg navbar-dark premium-navbar py-2">
            <div className="container-fluid">
                <a className="navbar-brand d-flex align-items-center" href="/">
                    <img src={kingAB} alt="Logo" width="45" height="45" className="d-inline-block rounded-pill img-fluid mx-3 border border-secondary" style={{ borderColor: 'rgba(240, 100, 197, 0.5) !important' }} />
                    <span className="premium-brand-text">Warranty Storage</span>
                </a>
                <button className="navbar-toggler premium-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavAltMarkup" aria-controls="navbarNavAltMarkup" aria-expanded="false" aria-label="Toggle navigation">
                    <span className="navbar-toggler-icon"></span>
                </button>
                <div className="collapse navbar-collapse" id="navbarNavAltMarkup">
                    <div className="navbar-nav ms-auto pe-4">
                        <a className="nav-link premium-nav-link" aria-current="page" href="/">Home</a>
                        <a className="nav-link premium-nav-link" href="/AboutUs">About Us</a>
                        <a className="nav-link premium-nav-link" href="/FAQs">FAQs</a>
                        <a className="nav-link premium-nav-link" href="/ContactUs">Contact Us</a>
                    </div>
                </div>
            </div>
        </nav>
    )
}