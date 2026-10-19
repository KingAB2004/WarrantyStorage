const sgMail = require('@sendgrid/mail')
const queue = require('./rabbit')

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const sendEmail = async (mailData) => {
    try {
        await sgMail.send(mailData)
        console.log('Email sent via SendGrid')
    } catch (error) {
        if (error.response) console.error(error.response.body)
        if (error.code >= 400 && error.code < 500 && error.code !== 429) {
            console.error('Email rejected, not retrying:', error.message)
            return
        }
        throw error
    }
}

const startEmailWorker = () => queue.consume('email', sendEmail)

module.exports = startEmailWorker
