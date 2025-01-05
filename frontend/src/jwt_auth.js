import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const CheckAuthAndRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const verifyToken = async () => {
      const token = localStorage.getItem("jwt_token");

      if (!token) {
        navigate("/Login");
        return;
      }

      try {
        const { data } = await axios.get("http://localhost:5000/warranty/setup/id", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error("Token verification failed:", error);
        localStorage.removeItem("jwt_token"); 
        navigate("/Login");
      }
    };

    verifyToken();
  }, [navigate]);

  return null; 
};

export default CheckAuthAndRedirect;
