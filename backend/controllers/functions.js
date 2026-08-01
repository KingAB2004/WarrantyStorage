const express = require('express')
const mongoose = require('mongoose')
const { UserLogin, Merchant, UserWarranty, ContactUs } = require('../models/schema')
const asyncWrapper = require('../middleware/async')
const nodemailer = require("nodemailer")
require('dotenv').config();
const jwt = require('jsonwebtoken')
const multer = require('multer');
const verifyToken = require('../middleware/auth')

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        return cb(null, "./uploads");
    },
    filename: function (req, file, cb) {
        return cb(null, `${Date.now()}-${file.originalname}}`);
    },
});

const upload = multer({ storage: storage });


const bcrypt = require('bcrypt');
const addingnewuser = async (req, res) => {
    let unhashedpassword = (req.body.password)
    const saltRounds = 10
    salt = bcrypt.genSaltSync(saltRounds)
    hashed = bcrypt.hashSync(unhashedpassword, salt)
    try {
        const userinfo = {
            "username": req.body.username,
            "email": req.body.email,
            "password": hashed
        }
        const task = await UserLogin.create(userinfo)

        res.status(200).json({ userinfo })
    }
    catch (error) {
        res.status(500).json(error)
    }
}

const fetchingdetails = async (req, res) => {

    if (req.body.isMerchant) {
        try {
            const output = await Merchant.find({ work_email: req.body.email })
            if (output.length === 0) {
                return res.status(404).json({ success: false, "msg": "user not found" })
            }
            const user = { email: req.body.email }; // Example user (this should be retrieved from your database)
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
            const data = {
                "hashed": output[0].password,
                "token": token,
                "StoreLocation": output[0].business_add,
                "StoreName": output[0].business_name,
                "WorkNumber": output[0].work_phone,
            }
            res.status(200).json(data)

        } catch (error) {
            res.status(500).json(error)
        }
    }
    else {

        try {
            const output = await UserLogin.find({ email: req.body.email })
            if (output.length === 0) {
                return res.status(404).json({ success: false, "msg": "user not found" })
            }
            const user = { email: req.body.email }; // Example user (this should be retrieved from your database)
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
            const data = {
                "hashed": output[0].password,
                "token": token
            }
            res.status(200).json(data)

        } catch (error) {
            res.status(500).json(error)
        }
    }
}

const addingnewmerchantuser = async (req, res) => {
    let unhashedpassword = (req.body.password)
    const saltRounds = 10
    salt = bcrypt.genSaltSync(saltRounds)
    hashed = bcrypt.hashSync(unhashedpassword, salt)
    try {
        const merchantuserinfo = {
            "business_name": req.body.business_name,
            "your_name": req.body.your_name,
            "work_email": req.body.work_email,
            "alt_phone": req.body.alt_phone,
            "work_phone": req.body.work_phone,
            "business_add": req.body.business_add,
            "business_type": req.body.business_type,
            "password": hashed
        }
        const task = await Merchant.create(merchantuserinfo)
        res.status(200).json({ task })
    }
    catch (error) {
        res.status(500).json(error)
    }
}
const uploadwarranty = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'File is required.' });
    }
    try {
        const { email, product_name, store_name, store_location, purchase_date, expiry_date } = req.body;
        const newWarranty = {
            "email": email,
            "product_name": product_name,
            "store_name": store_name,
            "purchase_date": purchase_date,
            "expiry_date": expiry_date,
            "store_location": store_location,
            "invoice": req.file.buffer,
            "status": 'Pending Verification',
        };
        const task = await UserWarranty.create(newWarranty);
        res.status(200).send({ message: 'Warranty uploaded and awaiting verification.' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error', error: error.message });
    }
};


const getWarranty = async (req, res) => {
    try {
        const page = parseInt(req.body.page) || 1;
        const limit = parseInt(req.body.limit) || 10;
        const skip = (page - 1) * limit;

        const warranty = await UserWarranty.find({ email: req.body.email })
            .skip(skip)
            .limit(limit);

        const total = await UserWarranty.countDocuments({ email: req.body.email });

        res.status(200).json({ data: warranty, total, page, limit });
    } catch (error) {
        res.status(500).send(error);
    }
};
// 
// Contact Us page
// 
const Contact = asyncWrapper(async (req, res) => {
    const task = await ContactUs.create(req.body)
    const mailData = {
        from: process.env.Email,  // sender address
        to: req.body.email,    // list of receivers
        subject: 'Conformation of the Query',
        text: 'Your Query Has been Received ,We will process it shortly ',
        html: '<b>Hey there! </b><br> This is our first message sent with Nodemailer<br/>',
    };

    // Create transporter using Gmail's SMTP server
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.Email,  // Your Gmail address
            pass: process.env.Password,         // Your Gmail app password (not your account password)
        },
    });
    transporter.sendMail(mailData, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
    res.status(201).json({ task });
});


const rejectionmail = asyncWrapper(async (req, res) => {
    const message = req.body.message;
    const emailuser = req.body.email;
    const product_name = req.body.product_name;
    const purchase_date = req.body.purchase_date;
    const store_name = req.body.store_name;
    const store_location = req.body.store_location;
    const phone_no = req.body.phone_no;
    const text = `Your  ${product_name} purchased on ${purchase_date} was recieved on our ${store_name} at ${store_location} has been rejected due to the followingg reasons.`;
    const text2 = `For further queries visit our store or contact us on ${phone_no}`
    const mailData = {
        from: process.env.Email,
        to: `${emailuser}`,
        subject: 'Rejection of the Warranty ',
        html: `<b>Hey there! </b> <br>  ${text} <br> ${message} <br> ${text2}`,
    };

    // Create transporter using Gmail's SMTP server
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.Email,  // Your Gmail address
            pass: process.env.Password,         // Your Gmail app password (not your account password)
        },
    });
    transporter.sendMail(mailData, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
    res.status(201).json({ success: true });
});





const fetchvalidations = async (req, res) => {
    try {
        const { store_name, store_location, status } = req.body;

        // Validate required parameters
        if (!store_name || !store_location) {
            return res.status(400).json({
                success: false,
                message: "Store name and store location are required.",
            });
        }

        const page = parseInt(req.body.page) || 1;
        const limit = parseInt(req.body.limit) || 10;
        const skip = (page - 1) * limit;

        let query = { store_name, store_location };
        if (status !== 'All' && status !== null) {
            query.status = status;
        }

        const output = await UserWarranty.find(query).skip(skip).limit(limit);
        const total = await UserWarranty.countDocuments(query);

        if (output.length === 0) {
            return res.status(200).json({
                success: true,
                msg: "No warranties for your store right now.",
                data: [],
                total: 0
            });
        }

        const responseData = output.map((warranty) => {
            return {
                ...warranty.toObject(),
                invoiceUrl: warranty.invoice ? `/download/invoice/${warranty._id}` : null,
            };
        });

        res.status(200).json({
            success: true,
            data: responseData,
            total,
            page,
            limit
        });

    } catch (error) {
        // Handle any errors during the process
        console.error("Error fetching validations:", error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};
const updatewarrantystatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        let { month, year } = req.body;
        let { currdate } = req.body
        let date = new Date(currdate);
        date.setFullYear(date.getFullYear() + Number(year));
        date.setMonth(date.getMonth() + Number(month));
        date = date.toISOString().split('T')[0];
        if (status === 'rejected') {
            date = 'NA'
        }
        await UserWarranty.findByIdAndUpdate(id, { expiry_date: date, status }, { new: true })


        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating warranty status',
            error: error.message,
        });
    }
};






// Adding Forget Password apis

const otpStore = {};

const OTP = asyncWrapper(async (req, res) => {
    const num = req.body.num || Math.floor(1000 + Math.random() * 9000);
    otpStore[req.body.email] = num;

    const mailData = {
        from: process.env.Email,
        to: req.body.email,
        subject: 'Confirmation of the Query',
        text: 'Your Query Has been Received, We will process it shortly.',
        html: `<b>Hey there!</b><br>Your OTP for Warranty Storage Password Change is ${num}<br/>`,
    };

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.Email,  // Your Gmail address
            pass: process.env.Password,         // Your Gmail app password (not your account password)
        },
    });
    transporter.sendMail(mailData, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
    // res.status(201).json({task});
});



const UpdatePassword = async (req, res) => {
    const { email, password, otp } = req.body;

    if (String(otpStore[email]) !== String(otp)) {
        return res.status(401).json({ msg: "Invalid OTP" });
    }
    delete otpStore[email];

    let unhashedpassword = password;
    const saltRounds = 10;
    const salt = bcrypt.genSaltSync(saltRounds);
    const hashed = bcrypt.hashSync(unhashedpassword, salt);
    try {
        const task = await UserLogin.findOneAndUpdate({ email }, { password: hashed });
        res.status(201).json({ task });
    } catch (error) {
        res.status(500).json(error);
    }
};




// expiryDate Change 



const UpdateExpiry = async (req, res) => {
    const { year, month, ID } = req.body;
    try {
        const task = await UserLogin.findOne({ ID });
        if (!task) return res.status(404).json({ msg: "Not found" });
        let date = new Date(task.expiry_date || new Date());
        date.setFullYear(date.getFullYear() + Number(year));
        date.setMonth(date.getMonth() + Number(month));
        await UserLogin.findOneAndUpdate({ ID }, { expiry_date: date });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json(error);
    }
};














module.exports = { addingnewuser, fetchingdetails, rejectionmail, addingnewmerchantuser, uploadwarranty, getWarranty, Contact, updatewarrantystatus, fetchvalidations, OTP, UpdatePassword, UpdateExpiry }
