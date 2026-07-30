import { Container, Row, Col, Card } from 'react-bootstrap';
import ashish from './assets/ashish.png'
import ab from './assets/ab2.png'
import "./AboutUs.css"
import Navbar from './navbar';
import { Visibility } from '@mui/icons-material';

const teamMembers = [
  { name: 'Ashish Ranjan', image: ashish },
  { name: 'Arpit Bhomia', image: ab }
];

const values = [
  'Innovation',
  'Integrity',
  'Customer First',
  'Quality',
];

function AboutUs() {
  return (
    <div className="about-us-wrapper d-flex flex-column">
      <Navbar/>
      <Container className="my-5">
        <Row className="text-center mb-5 mt-5">
          <Col>
            <h1 className="display-4 about-header">Welcome to World of Assurance</h1>
            <p className="lead about-hero-subtitle">
              We implemented a centralized warranty storage system for Entrepreneurs
            </p>
            <div className="about-hero-divider"></div>
          </Col>
        </Row>

        <Row className="mb-5 text-center">
          <Col md={{ span: 8, offset: 2 }} className="about-glass-panel">
            <div className="mb-3">
              <Visibility style={{ fontSize: '3rem', color: '#f064c5' }} />
            </div>
            <h2 className="about-section-title">Our Vision</h2>
            <p className="about-section-description fs-5">
              To empower consumers and entrepreneurs by providing a seamless, secure, and centralized ecosystem for warranty management. We aim to eliminate paper clutter, streamline claim processes, and build a lasting bridge of trust between merchants and buyers worldwide.
            </p>
          </Col>
        </Row>

        <Row className="mb-5 text-center">
          <Col>
            <h2 className="about-section-title">Meet the Team</h2>
            <p className="about-section-subtitle">The brilliant minds behind our project</p>
          </Col>
        </Row>
        
        <Row className="justify-content-center">
          {teamMembers.map((member, index) => (
            <Col key={index} md={4} className="mb-4">
              <div className="about-team-card">
                <div className="member-image-container">
                  <img 
                    src={member.image} 
                    alt={member.name} 
                    className="member-image"
                    />
                  <div className="image-overlay"></div>
                </div>
                <div className="member-details">
                  <h3 className="member-name">{member.name}</h3>
                  <p className="member-position">Founder</p>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Container>
    </div>
  );
}

export default AboutUs;