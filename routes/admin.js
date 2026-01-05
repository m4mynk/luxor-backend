const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const User = require('../models/User');
const Order = require('../models/order');
const Product = require('../models/product');

// Admin Dashboard Stats Route
router.get('/dashboard', protect, adminMiddleware, async (req, res) => {
  try {
    // ✅ Basic Stats
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();

    // ✅ Revenue
    const orders = await Order.find();
    const totalRevenue = orders.reduce((acc, order) => acc + order.totalPrice, 0);

    // ✅ Orders by Status
    const statusAgg = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const ordersByStatus = {};
    statusAgg.forEach((s) => {
      ordersByStatus[s._id] = s.count;
    });

    // ✅ Top Selling Products
    const topProducts = await Order.aggregate([
      { $unwind: "$orderItems" },
      {
        $group: {
          _id: "$orderItems.product",
          name: { $first: "$orderItems.name" },
          sold: { $sum: "$orderItems.qty" },
        },
      },
      { $sort: { sold: -1 } },
      { $limit: 5 },
    ]);

    // ✅ Low Stock Alerts
    const lowStock = await Product.find({ countInStock: { $lt: 10 } })
      .select("name countInStock")
      .sort({ countInStock: 1 })
      .limit(5);

    res.json({
      totalUsers,
      totalOrders,
      totalProducts,
      totalRevenue,
      ordersByStatus,
      topProducts,
      lowStock: lowStock.map((p) => ({
        name: p.name,
        count: p.countInStock,
      })),
    });
  } catch (err) {
    console.error('❌ Admin dashboard error:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;