// models/Verification.js
const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  verificationCode: { type: String, required: true },
  verificationExpires: { type: Date, required: true },
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Verification', verificationSchema);