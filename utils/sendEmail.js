const { Resend } = require("resend");

if (!process.env.RESEND_API_KEY) {
  throw new Error("❌ RESEND_API_KEY is missing in environment variables");
}

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, text }) => {
  if (!to || !subject || !text) {
    throw new Error("❌ Missing email parameters");
  }

  const result = await resend.emails.send({
    from: "Luxor <onboarding@resend.dev>",
    to,
    subject,
    text,
  });

  console.log("📧 Email sent via Resend:", result);
};

module.exports = sendEmail;