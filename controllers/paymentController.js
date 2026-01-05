const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/order");
const Coupon = require("../models/coupon");

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc Create Razorpay order
const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId, currency = "INR" } = req.body;

    // 🔐 Fetch order from DB (source of truth)
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const options = {
      amount: order.totalPrice * 100, // 🔒 SERVER PRICE (paise)
      currency,
      receipt: `order_${order._id}`,
    };

    const razorpayOrder = await razorpay.orders.create(options);
    res.json({ success: true, order: razorpayOrder });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ success: false, message: "Failed to create Razorpay order" });
  }
};

// @desc Verify Razorpay payment
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    // ✅ Update order in DB
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: razorpay_payment_id,
      status: "Paid",
      update_time: new Date(),
    };

    // 🔐 Lock coupon ONLY after successful payment
    if (order.coupon) {
      const coupon = await Coupon.findOne({ code: order.coupon });
      if (coupon) {
        coupon.usedBy = coupon.usedBy || [];
        if (!coupon.usedBy.includes(order.user)) {
          coupon.usedBy.push(order.user);
          await coupon.save();
        }
      }
    }

    await order.save();

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("❌ Razorpay verify error:", err);
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

// @desc Refund Payment (Admin only)
const refundPayment = async (req, res) => {
  try {
    const { paymentId, amount } = req.body;

    const refund = await razorpay.payments.refund(paymentId, { amount: amount * 100 });
    res.json({ success: true, refund });
  } catch (err) {
    console.error("❌ Razorpay refund error:", err);
    res.status(500).json({ success: false, message: "Refund failed" });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  refundPayment,
};