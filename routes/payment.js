const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { protect } = require("../middleware/authMiddleware");
const Order = require("../models/order");

// ✅ Initialize Razorpay securely
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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

    if (dbOrder.isPaid) {
      return res.status(400).json({ message: "Order already paid" });
    }

    const options = {
      amount: dbOrder.totalPrice * 100, // 🔐 server-authoritative
      currency: "INR",
      receipt: `ord_${dbOrder._id.toString().slice(-8)}`,
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

// 🔐 Razorpay Webhook (FINAL payment authority)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      const signature = req.headers["x-razorpay-signature"];
      const body = req.body;

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(body))
        .digest("hex");

      if (expectedSignature !== signature) {
        console.error("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const event = body.event;

      // ✅ Payment captured
      if (event === "payment.captured") {
        const payment = body.payload.payment.entity;
        const notes = payment.notes || {};
        const orderId = notes.orderId;

        if (!orderId) {
          console.error("❌ No orderId in webhook notes");
          return res.status(200).send("No orderId");
        }

        const dbOrder = await Order.findById(orderId);
        if (!dbOrder) {
          console.error("❌ Order not found for webhook");
          return res.status(200).send("Order not found");
        }

        if (!dbOrder.isPaid) {
          dbOrder.isPaid = true;
          dbOrder.paidAt = new Date();
          dbOrder.paymentResult = {
            razorpay_payment_id: payment.id,
            razorpay_order_id: payment.order_id,
            status: payment.status,
            method: payment.method,
          };

          await dbOrder.save();
          console.log("✅ Order marked paid via webhook:", orderId);
        }
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("❌ Razorpay webhook error:", err);
      res.status(500).send("Webhook error");
    }
  }
);

module.exports = router;