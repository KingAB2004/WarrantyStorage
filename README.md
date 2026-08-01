# 🛡️ Warranty Storage - MERN Stack Project

## 📌 Overview
Warranty Storage is a full-stack MERN (MongoDB, Express, React, Node.js) application designed to help merchants and customers securely manage and verify warranty information.
It provides **secure authentication, warranty management, OTP-based password reset, an advanced Context-Aware AI Chatbot, and a premium glassmorphism UI**, making the warranty process more reliable and interactive. 

🔗 **Deployed Link:** [Warranty Storage Platform](https://warranty-storage-wh5d.vercel.app/) 
🔗 **GitHub Repository:** [Warranty Storage](https://github.com/KingAB2004/WarrantyStorage)

## 📸 Screenshots
*(Save your UI images to the `/screenshots/` directory and they will appear here)*

<p align="center">
  <img src="screenshots/dashboard.png" width="45%" alt="Dashboard View" />
  &nbsp;
  <img src="screenshots/chatbot.png" width="45%" alt="AI Chatbot Interaction" />
</p>
<p align="center">
  <img src="screenshots/login.png" width="45%" alt="Glassmorphism Login" />
  &nbsp;
  <img src="screenshots/merchant.png" width="45%" alt="Merchant Verification" />
</p>

---

## ✨ Features

### 🤖 Context-Aware AI Chatbot (RAG)
- **Live Context Injection:** Answers questions based on the active user/merchant's real-time warranty database.
- **Role-Based Intelligence:** Dynamically adapts its responses depending on whether the user is a client or merchant.
- **Real-Time Streaming:** Seamless typewriter-effect UI using Server-Sent Events (SSE).
- **Bulletproof Integration:** Uses low-level `https` tunnels to bypass Cloudflare/WAF drops and ensure stable connectivity to the LLM.

### 🔐 User Authentication
- **Register/Login:** Secure account creation and role-based login (Client vs Merchant). 
- **Password Hashing:** User passwords are hashed using browser-compatible `bcryptjs`. 
- **JWT Authentication:** JSON Web Tokens for secure session persistence. 
- **OTP Verification:** `nodemailer` driven secure password resets.

### 📄 Warranty Management & Filtering
- **Dynamic Dashboards:** Real-time multi-column data filtering (by Store, Location, Status).
- **Add Warranty:** Merchants can instantly issue warranties for customers. 
- **View Warranties:** Merchants and Clients possess separated, strictly isolated data scopes.
- **Verify Warranty:** Customers can submit details for verification. 

### 📱 Premium Responsive Design
- Built with **React + Bootstrap + Modern CSS** leveraging vibrant colors and dynamic glassmorphism components.
- Completely mobile friendly with global floating chat widget availability.

---

## 🛠️ Tech Stack

### Frontend
- React (React Router v6)
- Vanilla CSS (Glassmorphism & Micro-animations)
- Bootstrap
- React Markdown (Render stream logic)

### Backend
- Node.js & Express.js
- MongoDB (via Mongoose)
- Native `https` streaming standard

### AI & Third-Party APIs
- **Groq API**: High-speed AI inference running `llama-3.1-8b-instant`.
- Axios – API requests 
- bcryptjs – Password hashing 
- nodemailer – Email/OTP functionality 
- dotenv – Environment variable management 

---

## ⚡ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 
- [MongoDB](https://www.mongodb.com/) (local or cloud instance)
- A [Groq API Key](https://console.groq.com/) for the AI Chatbot

### Steps

1. **Clone the Repository**
   ```bash
   git clone https://github.com/KingAB2004/WarrantyStorage.git
   cd WarrantyStorage
   ```

2. **Set Up Environment Variables** 
   Create a `.env` file in the **backend** folder: 
   ```env
   PORT=5000
   URI=<your-mongo-db-connection-string>
   JWT_SECRET=<your-jwt-secret>
   EMAIL=<your-gmail-address>
   PASSWORD=<your-gmail-app-password>
   Api_key=<your-groq-api-key>
   ```

3. **Install Dependencies**
   - Backend:
     ```bash
     cd backend
     npm install
     ```
   - Frontend:
     ```bash
     cd frontend
     npm install
     ```

4. **Run the Application**
   - Start backend (runs on `:5000`):
     ```bash
     cd backend
     npm run dev
     ```
   - Start frontend (runs on `:3000`):
     ```bash
     cd frontend
     npm start
     ```

5. **Access the App** 
   Open [http://localhost:3000](http://localhost:3000) in your browser. 
   *(Note: For local testing, ensure the frontend `axios` and API endpoints point to `http://localhost:5000` instead of the production URLs)*

---

## 🚀 Future Enhancements
- Fine-tuned Embeddings / Vector Database for RAG scaling.
- Push notifications for OTP and warranty updates. 
- Cloud storage for uploading warranty documents. 
- Advanced analytics & reporting for merchants. 

---

## 🤝 Contributing
We welcome contributions! 
1. Fork the repo 
2. Create a new branch (`feature/your-feature-name`) 
3. Commit your changes 
4. Push your branch and create a Pull Request 

---

## 📜 License
This project is open-source and available under the [MIT License](LICENSE). 

---

💡 *Thank you for using Warranty Storage!* 
