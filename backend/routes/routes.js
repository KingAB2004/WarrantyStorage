const express = require('express')
const multer = require('multer');
const upload = multer();
const router = express.Router()
const { addingnewuser, fetchingdetails, addingnewmerchantuser, uploadwarranty, getWarranty, Contact, fetchvalidations, updatewarrantystatus, OTP, UpdatePassword, rejectionmail, UpdateExpiry } = require('../controllers/functions')
const { chatHandler } = require('../controllers/chatbotController')

const authHeader = require('../middleware/auth')

router.route('/').post(addingnewuser)
router.route('/addmerchant').post(addingnewmerchantuser)
router.route('/id').post(fetchingdetails).get(authHeader, (req, res) => res.send({ email: req.user.email }));



router.route('/getwarranty').post(getWarranty)
router.post('/createwarranty', upload.single('invoice'), uploadwarranty)


router.route('/merchantverifications').post(fetchvalidations);
router.route('/merchantverifications/:id').patch(updatewarrantystatus);

router.route('/contactus').post(Contact);
router.route('/rejectwarranty').post(rejectionmail);
router.route('/OTP').post(OTP)


router.route('/UpdatePassword').post(UpdatePassword)


router.route('/UpdateExpiry').post(UpdateExpiry)

router.route('/chatbot').post(chatHandler)

module.exports = router