const nodemailer = require("nodemailer");
const { Resend } = require("resend");

const resend =
  process.env.NODE_ENV === "production"
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const sendEmail = async ({ to, subject, text }) => {
  // 🧪 LOCALHOST → Gmail SMTP
  if (process.env.NODE_ENV !== "production") {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Luxor" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });

    console.log("📧 Email sent via Gmail (dev)");
    return;
  }

  // 🚀 PRODUCTION → Resend API
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
  });

  console.log("📧 Email sent via Resend (prod)");
};

module.exports = sendEmail;