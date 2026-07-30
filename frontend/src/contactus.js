import React from "react";
import Navbar from "./navbar";
import axios from "axios";
import './ContactUs.css';
import { Person, Email, Message, Send } from "@mui/icons-material";

export default function ContactUs(){
    const [formData, setFormData] = React.useState({
        name: '',
        email: '',
        message: ''
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
        try{
         const response= await axios.post('http://localhost:5000/warranty/setup/contactus' ,formData)

         setFormData({
          name: '',
          email: '',
          message: ''
        });
        alert("Message Has been sent Successfully")
        }
        catch(error)
        {
          console.log(error)
        }
      };
      
    return (
      <div className="contact-wrapper d-flex flex-column">
        <Navbar />
        
        <div className="flex-grow-1 d-flex align-items-center mb-5">
            <div className="container contact-hero d-flex justify-content-center">
              <div className="col-lg-6 col-md-8 col-sm-10">
                <div className="contact-glass-panel">
                  
                  <div className="contact-header">
                    <h2>Get in Touch</h2>
                    <p>We'd love to hear from you. Send us a message!</p>
                  </div>
                  
                  <div className="contact-body">
                    <form onSubmit={handleSubmit}>
                      <div className="mb-4 text-start">
                        <label htmlFor="name" className="contact-label">
                          <Person className="contact-icon"/> Name
                        </label>
                        <input
                          type="text"
                          className="form-control contact-form-control"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="What's your name?"
                          required
                        />
                      </div>
                      
                      <div className="mb-4 text-start">
                        <label htmlFor="email" className="contact-label">
                          <Email className="contact-icon"/> Email
                        </label>
                        <input
                          type="email"
                          className="form-control contact-form-control"
                          id="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="Where can we reach you?"
                          required
                          />
                      </div>
                      
                      <div className="mb-5 text-start">
                        <label htmlFor="message" className="contact-label">
                          <Message className="contact-icon"/> Message
                        </label>
                        <textarea
                          className="form-control contact-form-control"
                          id="message"
                          name="message"
                          rows="5"
                          value={formData.message}
                          onChange={handleChange}
                          placeholder="How can we help?"
                          required
                          ></textarea>
                      </div>
                      
                      <div className="text-center">
                        <button type="submit" className="btn contact-btn-submit">
                          Send Message <Send className="ms-2" style={{ fontSize: '1.2rem'}} />
                        </button>
                      </div>
                    </form>
                  </div>
                  
                  <div className="contact-footer">
                    <small>© 2024 LazyKings, Inc. All rights reserved.</small>
                  </div>
                  
                </div>
              </div>
            </div>
        </div>
      </div>
    )
}