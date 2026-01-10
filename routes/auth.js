const Verification = require('../models/Verification'); // Make sure this line is added at the top
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const sendEmail = require('../utils/sendEmail');

// Helper to send cookie
const sendToken = (user, res) => {
  const token = jwt.sign(
    { id: user._id }, // only store id in token
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // ✅ always send fresh role from DB
  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    }
  });
};

// ✅ Step 1: Send OTP to Email
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  try {
    // Block only if fully registered
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered and verified' });
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = Date.now() + 10 * 60 * 1000;

    // Update or create verification entry
    let verification = await Verification.findOne({ email });
    if (verification) {
      verification.verificationCode = verificationCode;
      verification.verificationExpires = verificationExpires;
      verification.isVerified = false;
    } else {
      verification = new Verification({
        email,
        verificationCode,
        verificationExpires,
        isVerified: false
      });
    }

    await verification.save();

    console.log("📩 OTP sent to:", email, "Code:", verificationCode);
    await sendEmail({
      to: email,
      subject: 'Your Luxor OTP',
      text: `Your verification code is: ${verificationCode}`
    });

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('❌ Error in /send-otp:', err);
    res.status(500).json({ message: 'Error sending OTP', error: err.message });
  }
});

// ✅ Register (after OTP verification)
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    // 1. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // 2. Check if email is verified via OTP
    const verified = await Verification.findOne({ email });
    if (!verified || !verified.isVerified) {
      return res.status(400).json({ message: 'Please verify your email before registering' });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create real user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'customer',
      isVerified: true
    });

    // 5. Delete verification entry (optional cleanup)
    await Verification.deleteOne({ email });

    // 6. Send JWT and respond
    sendToken(user, res);
  } catch (err) {
    console.error('❌ Error in /register:', err.message);
    res.status(500).json({ message: 'Registration failed', error: err.message });
  }
});

// ✅ Step 2: Verify OTP
router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;

  try {
    const verification = await Verification.findOne({ email });

    if (!verification) {
      return res.status(404).json({ message: 'No verification request found for this email.' });
    }

    if (
      verification.verificationCode !== code ||
      !verification.verificationExpires ||
      verification.verificationExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    verification.isVerified = true;
    await verification.save();

    res.json({ message: 'Email verified successfully. Please continue with registration.' });
  } catch (err) {
    console.error('❌ Error verifying OTP:', err);
    res.status(500).json({ message: 'Verification failed', error: err.message });
  }
});

// ✅ Login
// ✅ Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    sendToken(user, res);
  } catch (err) {
    res.status(500).json({ message: 'Login error', error: err.message });
  }
});

// ✅ Logout
// LOGOUT
router.post("/logout", (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  res.status(200).json({ message: "Logged out successfully" });
});

// ✅ Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
  let email = req.body?.email;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "Valid email is required" });
  }

  email = email.trim().toLowerCase();

  // ❌ Block accidental frontend URL being sent as email
  if (email.startsWith("http")) {
    console.error("❌ Invalid email payload received:", email);
    return res.status(400).json({ message: "Invalid email value" });
  }

  try {
    console.log("📨 Forgot-password hit for:", email);

    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ Forgot-password: user not found");
      return res.status(404).json({ message: 'User not found' });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = Date.now() + 10 * 60 * 1000;

    user.resetCode = resetCode;
    user.resetExpires = resetExpires;
    await user.save();

    console.log("📤 Sending reset OTP email to:", email);

    try {
      await sendEmail({
        to: email,
        subject: 'Luxor Password Reset Code',
        text: `Your password reset code is: ${resetCode}`,
      });
    } catch (mailErr) {
      console.error("❌ Email sending failed:", mailErr.message);
      return res.status(500).json({ message: 'Email service failed' });
    }

    console.log("✅ Reset OTP sent successfully");
    res.json({ message: 'Reset code sent to email' });
  } catch (err) {
    console.error('❌ Error in /forgot-password:', err);
    res.status(500).json({ message: 'Error sending reset code', error: err.message });
  }
});

// ✅ Reset Password
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const user = await User.findOne({ email });
    if (
      !user ||
      user.resetCode !== code ||
      !user.resetExpires ||
      user.resetExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetCode = undefined;
    user.resetExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('❌ Error in /reset-password:', err);
    res.status(500).json({ message: 'Password reset failed', error: err.message });
  }
});

// ✅ Protected route

// ✅ Protected route
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.address?.phone || '',
        address: user.address || {}
      }
    });
  } catch (err) {
    console.error('❌ Error in /me route:', err);
    res.status(500).json({ message: 'Failed to fetch user data' });
  }
});

// ✅ Update Address Route
router.post('/update-address', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { phone, address } = req.body;

    if (phone) {
      if (!user.address) user.address = {};
      user.address.phone = phone; // ✅ Store phone inside address object
    }

    if (!user.address) user.address = {};
    if (address) {
      user.address.street = address.street || user.address.street;
      user.address.city = address.city || user.address.city;
      user.address.state = address.state || user.address.state;
      user.address.postalCode = address.postalCode || user.address.postalCode;
      user.address.country = address.country || user.address.country;
    }

    await user.save();

    res.json({
      message: 'Address updated',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.address?.phone || '',
        address: user.address || {}
      }
    });
  } catch (err) {
    console.error('❌ Address update error:', err);
    res.status(500).json({ message: 'Failed to update address', error: err.message });
  }
});

// ✅ Admin Stats Route
router.get('/admin/stats', protect, adminMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ totalUsers });
  } catch (err) {
    console.error('❌ Error fetching admin stats:', err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

module.exports = router;