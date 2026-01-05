const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { protect } = require("../middleware/authMiddleware");
const Order = require("../models/order");

// ✅ Create Razorpay order (secure, DB-driven)
router.post("/order", protect, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    const dbOrder = await Order.findById(orderId);
    if (!dbOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    const options = {
      amount: dbOrder.totalPrice * 100, // 🔐 server-authoritative
      currency: "INR",
      receipt: `order_rcpt_${dbOrder._id}_${Date.now()}`,
      notes: {
        orderId: dbOrder._id.toString(),
        userId: req.user._id.toString(),
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);
    res.json(razorpayOrder);
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ message: "Failed to create Razorpay order" });
  }
});

// ✅ Initialize Razorpay securely
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc Create Razorpay order (secure)
router.post("/create-order", protect, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // ✅ Double-check that order exists in DB
    const dbOrder = await Order.findById(orderId);
    if (!dbOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ Ensure the amount matches backend’s order total
    const options = {
      amount: dbOrder.totalPrice * 100, // 🔐 SERVER PRICE (paise)
      currency: "INR",
      receipt: `order_rcptid_${dbOrder._id}_${Date.now()}`,
      notes: {
        orderId: dbOrder._id.toString(),
        userId: req.user._id.toString(),
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);
    res.json({ order: razorpayOrder });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ message: "Failed to create payment order" });
  }
});

// @desc Verify Razorpay payment securely
router.post("/verify", protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    // ✅ Validate signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    // ✅ Fetch order and mark as paid
    const dbOrder = await Order.findById(orderId);
    if (!dbOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    dbOrder.isPaid = true;
    dbOrder.paidAt = Date.now();
    dbOrder.paymentResult = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    };

    await dbOrder.save();

    res.json({ success: true, message: "Payment verified successfully", order: dbOrder });
  } catch (err) {
    console.error("❌ Razorpay verify error:", err);
    res.status(500).json({ message: "Server error verifying payment" });
  }
});

module.exports = router;