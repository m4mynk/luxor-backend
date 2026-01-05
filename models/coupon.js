// models/coupon.js
const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // always store as UPPERCASE
    },
    discountType: {
      type: String,
      enum: ["flat", "percent"], // ✅ keep lowercase internally
      required: true,
      lowercase: true, // ✅ force everything to lowercase
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    minPurchase: {
      type: Number,
      default: 0, // e.g. coupon applies only above ₹1000
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);