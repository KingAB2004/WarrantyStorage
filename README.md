# 🛡️ Warranty Storage - MERN Stack Project

## 📌 Overview
Warranty Storage is a full-stack MERN (MongoDB, Express, React, Node.js) application designed to help merchants and customers securely manage and verify warranty information.
It provides **secure authentication, warranty management, OTP-based password reset, and a responsive UI**, making the warranty process more reliable and user-friendly. 

🔗 **Deployed Link:** [Warranty Storage Platform](https://warranty-storage-wh5d.vercel.app/) 
🔗 **GitHub Repository:** [Warranty Storage](https://github.com/KingAB2004/WarrantyStorage)

---

## ✨ Features

### 🔐 User Authentication
- **Register/Login:** Secure account creation and login. 
- **Password Hashing:** User passwords are hashed using `bcrypt`. 
- **JWT Authentication:** JSON Web Tokens for session management. 

### 📄 Warranty Management
- **Add Warranty:** Merchants can add warranty details for customers. 
- **View Warranties:** Merchants can view all stored warranties. 
- **Verify Warranty:** Customers can submit details for verification. 

### 📧 OTP Verification
- **Password Reset:** OTP sent via email using `nodemailer`. 
- **OTP Validation:** Ensures secure password resets. 

### 🔒 Secure APIs
- Protected API routes using middleware. 
- Only authenticated users can access sensitive data. 

### 📱 Responsive Design
- Built with **React + Bootstrap** for a clean, mobile-friendly UI. 

---

## 🛠️ Tech Stack

### Frontend
- React 
- Bootstrap 

### Backend
- Node.js 
- Express.js 

### Database
- MongoDB (NoSQL database) 

### Other Tools & Libraries
- Axios – API requests 
- Mongoose – MongoDB interactions 
- bcrypt – Password hashing 
- nodemailer – Email/OTP functionality 
- dotenv – Environment variable management 

---

## ⚡ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) 
- [npm](https://www.npmjs.com/) 
- [MongoDB](https://www.mongodb.com/) (local or cloud instance)

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
   MONGO_URI=<your-mongo-db-connection-string>
   JWT_SECRET=<your-jwt-secret>
   EMAIL=<your-email-address>
   PASSWORD=<your-email-password>
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
   - Start backend:
     ```bash
     cd backend
     npm run dev
     ```
   - Start frontend:
     ```bash
     cd frontend
     npm start
     ```

5. **Access the App** 
   Open [http://localhost:3000](http://localhost:3000) in your browser. 

---

## 📂 Folder Structure
```
project-root/
|-- backend/
|   |-- controllers/       # Business logic for routes
|   |-- models/            # Mongoose schemas
|   |-- routes/            # API routes
|   |-- middleware/        # Authentication middleware
|   |-- utils/             # Helper functions (e.g., OTP/email)
|   |-- server.js          # Backend entry point
|
|-- frontend/
|   |-- src/
|       |-- components/    # Reusable React components
|       |-- pages/         # App pages (Login, Register, Dashboard, etc.)
|       |-- App.js         # Main React app component
|       |-- index.js       # Entry point for React
|
|-- README.md              # Documentation
```

---

## 🚀 Future Enhancements
- Role-based access (merchants vs. customers). 
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
