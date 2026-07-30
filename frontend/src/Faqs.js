import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from './navbar';
import './Faqs.css';
import { HelpOutline, SupportAgent } from '@mui/icons-material';

function FAQs() {
  return (
    <div className="faqs-wrapper d-flex flex-column">
      <Navbar />
      <div className="container py-5 mt-5">
        
        <div className="faqs-hero">
            <h1 className="faqs-hero-title">Got Questions?</h1>
            <p className="faqs-hero-subtitle">We're here to help. Browse through our frequently asked questions to find answers to our most common queries.</p>
        </div>

        <div className="row justify-content-center">
            <div className="col-lg-10">
                <div className="faqs-glass-panel">
                <div className="accordion accordion-flush" id="faqsAccordion">

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingOne">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> How do I add a warranty to the storage platform?
                        </button>
                    </h2>
                    <div id="collapseOne" className="accordion-collapse collapse" aria-labelledby="headingOne" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        To add a warranty, simply upload a copy of it to the platform. Before it’s fully stored, the warranty will be sent to the merchant for verification to ensure it’s authentic.
                        </div>
                    </div>
                    </div>

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingTwo">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> Why is merchant verification required for my warranty?
                        </button>
                    </h2>
                    <div id="collapseTwo" className="accordion-collapse collapse" aria-labelledby="headingTwo" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        Merchant verification ensures that only valid, legitimate warranties are stored, protecting you from potentially incorrect or unauthorized records.
                        </div>
                    </div>
                    </div>

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingThree">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> How long does the merchant verification process take?
                        </button>
                    </h2>
                    <div id="collapseThree" className="accordion-collapse collapse" aria-labelledby="headingThree" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        The time for verification depends on the merchant's response. The platform keeps you updated on the status, and you will be notified once the merchant confirms the warranty.
                        </div>
                    </div>
                    </div>

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingFour">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFour" aria-expanded="false" aria-controls="collapseFour">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> How does the platform handle expired warranties?
                        </button>
                    </h2>
                    <div id="collapseFour" className="accordion-collapse collapse" aria-labelledby="headingFour" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        The platform automatically removes expired warranties from your account. This helps keep your records current and ensures you only see valid, active warranties.
                        </div>
                    </div>
                    </div>

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingFive">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFive" aria-expanded="false" aria-controls="collapseFive">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> Will I be notified before a warranty expires?
                        </button>
                    </h2>
                    <div id="collapseFive" className="accordion-collapse collapse" aria-labelledby="headingFive" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        Yes, you'll receive a notification before a warranty expires, giving you time to use any remaining benefits or services associated with it.
                        </div>
                    </div>
                    </div>

                    <div className="accordion-item faqs-accordion-item">
                    <h2 className="accordion-header" id="headingSix">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseSix" aria-expanded="false" aria-controls="collapseSix">
                        <HelpOutline className="me-3" style={{ color: '#f064c5' }}/> Is my data secure on this platform?
                        </button>
                    </h2>
                    <div id="collapseSix" className="accordion-collapse collapse" aria-labelledby="headingSix" data-bs-parent="#faqsAccordion">
                        <div className="accordion-body">
                        Absolutely. The platform uses secure, encrypted storage to protect your data, ensuring that only you and verified merchants can access your warranty information.
                        </div>
                    </div>
                    </div>

                </div> 

                <div className="text-center mt-5 pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                    <p className="text-white-50 mb-3">Still have questions?</p>
                    <a href="/ContactUs" className="btn btn-outline-light rounded-pill px-4 py-2" style={{ borderColor: '#f064c5', color: '#f064c5' }}>Contact Support <SupportAgent className="ms-2"/></a>
                </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}

export default FAQs;
