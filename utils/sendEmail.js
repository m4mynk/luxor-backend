const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, text, html }) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Gmail address
      pass: process.env.EMAIL_PASS  // Gmail app password
    }
  });

  await transporter.sendMail({
    from: `"Luxor" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,  // fallback (for old email clients)
    html   // ✅ styled email
  });
};

module.exports = sendEmail;