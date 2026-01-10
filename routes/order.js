const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  markOrderPaid,
  markOrderDelivered,
} = require('../controllers/ordercontroller');

// ✅ Import 'protect' correctly (named export)
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const Order = require('../models/order');

// ✅ Import sendEmail util
const sendEmail = require('../utils/sendEmail');

// ✅ Routes

// Create order
router.post('/', protect, async (req, res) => {
  if (!req.user.isVerified) {
    return res.status(403).json({ message: 'Please verify your account to place an order.' });
  }

  try {
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 7);

    req.body.status = 'Processing';
    req.body.estimatedDelivery = estimatedDelivery;

    if (req.body.paymentMethod === "Online Payment") {
      // Online payment → order exists but NOT paid yet
      req.body.isPaid = false;
      req.body.paymentStatus = "pending";
      req.body.paidAt = undefined;
    }

    if (req.body.paymentMethod === "Cash on Delivery") {
      // COD → payment happens on delivery, NOT now
      req.body.isPaid = false;
      req.body.paymentStatus = "cod";
      req.body.paidAt = undefined;
    }

    // ❌ Block invalid online-payment orders
    if (
      req.body.paymentMethod === "Online Payment" &&
      (!req.body.totalPrice || Number(req.body.totalPrice) <= 0)
    ) {
      return res.status(400).json({
        message: "Invalid order amount. Online payment requires a valid total.",
      });
    }

    // ✅ create order directly
    const order = await createOrder(req, res);

    if (order && order._id) {
      await sendEmail({
        to: req.user.email,
        subject: "Luxor - Order Confirmation",
        text: `Thank you for your order! Order ID: ${order._id}, Total: ₹${order.totalPrice}`,
        html: `
          <h2>Hi ${req.user.name},</h2>
          <p>Thank you for your order!</p>
          <p><strong>Order ID:</strong> ${order._id}</p>
          <p><strong>Total:</strong> ₹${order.totalPrice}</p>
          <p>Estimated Delivery: ${order.estimatedDelivery?.toDateString()}</p>
          <br/>
          <p>You can track your order anytime from your Luxor dashboard.</p>
          <p>– Team Luxor</p>
        `
      });
    }
  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
});

// Get user's orders
router.get('/myorders', protect, getMyOrders);

// Get all orders (admin only)
router.get('/', protect, adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'name email')
      .select('+paymentStatus +paymentMethod +isPaid');
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

// ✅ Cancel Order Route
router.put("/:id/cancel", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Make sure only the owner (or admin) can cancel
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(401).json({ message: "Not authorized to cancel this order" });
    }

    // Only allow cancelling if still processing
    if (order.status !== "Processing") {
      return res.status(400).json({ message: "Order cannot be cancelled at this stage" });
    }

    if (order.paymentMethod === "Online Payment" && order.paymentStatus === "pending") {
      order.paymentStatus = "failed";
    }

    order.status = "Cancelled";
    await order.save();

    res.json({ message: "Order cancelled successfully", order });
  } catch (err) {
    console.error("❌ Cancel order error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get orders by status (admin only, e.g., Processing, Shipped, Delivered)
router.get('/status/:status', protect, adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ status: req.params.status }).populate('user', 'name email');
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch orders by status' });
  }
});

// 📊 Admin Analytics Routes

// Summary: total orders, revenue, customers
router.get('/analytics/summary', protect, adminMiddleware, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenueAgg = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } }
    ]);
    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    const totalCustomers = await Order.distinct("user").then(users => users.length);

    res.json({ totalOrders, totalRevenue, totalCustomers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch summary analytics" });
  }
});

// Orders by status
router.get('/analytics/status', protect, adminMiddleware, async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch status analytics" });
  }
});

// Sales by day (last 30 days)
router.get('/analytics/sales', protect, adminMiddleware, async (req, res) => {
  try {
    const data = await Order.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSales: { $sum: "$totalPrice" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch sales analytics" });
  }
});

// Update order status (admin only) - Processing → Packed → Shipped → Delivered → Cancelled
router.put('/:id/status', protect, adminMiddleware, async (req, res) => {
  const { status } = req.body;
  const validStatuses = [
    'Processing',
    'Packed',
    'Shipped',
    'Out for Delivery',
    'Delivered',
    'Cancelled'
  ];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    // ✅ populate user info so we can send emails
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    order.status = status;

    // ✅ Auto-update deliveredAt when status is Delivered
    if (status === 'Delivered') {
      order.deliveredAt = Date.now();
    }

    // ✅ If order is cancelled, clear delivery info
    if (status === 'Cancelled') {
      order.deliveredAt = undefined;
      order.isDelivered = false;
    }

    const updatedOrder = await order.save();

    // ✅ Send email notification to customer
    if (order.user?.email) {
      let subject = `Luxor - Order ${status}`;
      let html = `
        <h2>Hi ${order.user.name || 'Customer'},</h2>
        <p>Your order <strong>${order._id}</strong> status has been updated:</p>
        <p><strong>${status}</strong></p>
        ${
          order.estimatedDelivery
            ? `<p>Estimated Delivery: ${order.estimatedDelivery.toDateString()}</p>`
            : ''
        }
        <p>– Team Luxor</p>
      `;

      await sendEmail({
        to: order.user.email,
        subject,
        text: `Your order ${order._id} is now ${status}`,
        html
      });
    }

    res.json({ message: 'Order status updated successfully', order: updatedOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

// PUT /api/orders/:id/admin-cancel
router.put('/:id/admin-cancel', protect, adminMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status === 'Delivered') {
      return res.status(400).json({ message: 'Delivered orders cannot be cancelled' });
    }

    order.status = 'Cancelled';
    order.isDelivered = false;
    order.deliveredAt = null;
    await order.save();

    res.json({ message: 'Order cancelled by admin', order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get order by ID
router.get('/:id', protect, getOrderById);

// Mark as paid
router.put('/:id/pay', protect, async (req, res) => {
  try {
    // ✅ First call your controller to mark order paid
    const updatedOrder = await markOrderPaid(req, res);

    // ✅ If controller already sent response, stop here
    if (res.headersSent) return;

    // ✅ Load user details for email
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order && order.user?.email) {
      await sendEmail({
        to: order.user.email,
        subject: "Luxor - Payment Successful",
        text: `Your payment for Order ${order._id} was successful. Total Paid: ₹${order.totalPrice}`,
        html: `
          <h2>Hi ${order.user.name || "Customer"},</h2>
          <p>Your payment for Order <strong>${order._id}</strong> was successful.</p>
          <p><strong>Total Paid:</strong> ₹${order.totalPrice}</p>
          <p><strong>Paid At:</strong> ${new Date(order.paidAt).toLocaleString()}</p>
          <br/>
          <p>We’ll notify you when your order is shipped.</p>
          <p>– Team Luxor</p>
        `
      });
    }

    // ✅ Send response to frontend
    res.json(updatedOrder);
  } catch (err) {
    console.error("❌ Payment confirmation error:", err);
    res.status(500).json({ message: "Failed to mark order as paid and send email" });
  }
});

// Mark as delivered (admin only)
router.put('/:id/deliver', protect, adminMiddleware, markOrderDelivered);


// ✅ Track order by ID and email (POST) - secure version
router.post('/track', async (req, res) => {
  const { orderId, email } = req.body;
  if (!orderId || !email) {
    return res.status(400).json({ message: 'Order ID and email are required.' });
  }

  try {
    const order = await Order.findById(orderId).populate('user', 'email');
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (order.user?.email !== email) {
      return res.status(403).json({ message: 'Email does not match the order record.' });
    }

    res.json({ status: order.status, estimatedDelivery: order.estimatedDelivery, order });
  } catch (err) {
    res.status(500).json({ message: 'Error tracking order', error: err.message });
  }
});

module.exports = router;