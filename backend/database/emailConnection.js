const nodemailer = require('nodemailer');











const transporter = nodemailer.createTransport({
    host: 'mail.spacemail.com',
    port: 465,
    secure: true,
    auth: {
        user: 'msg@talkdrove.com',
        pass: '3800380@Hamza'
    }
});


module.exports = transporter;