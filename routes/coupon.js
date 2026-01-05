// routes/coupon.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const Coupon = require("../models/coupon");

// ✅ Admin: Create a coupon
router.post("/", protect, adminMiddleware, async (req, res) => {
  try {
    const { code, discountType, discountValue, minPurchase, expiryDate } = req.body;

    const exists = await Coupon.findOne({ code: code.toUpperCase() });
    if (exists) return res.status(400).json({ message: "Coupon code already exists" });

    const coupon = await Coupon.create({
      code,
      discountType: discountType.toLowerCase(), // ✅ normalize input
      discountValue,
      minPurchase,
      expiryDate,
    });

    res.status(201).json(coupon);
  } catch (err) {
    console.error("❌ Create coupon error:", err);
    res.status(500).json({ message: "Failed to create coupon" });
  }
});

// ✅ Admin: Get all coupons
router.get("/", protect, adminMiddleware, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch coupons" });
  }
});

// ✅ Admin: Delete a coupon
router.delete("/:id", protect, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });

    await coupon.deleteOne();
    res.json({ message: "Coupon deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete coupon" });
  }
});

// ✅ Public: Validate coupon
router.post("/validate", protect, async (req, res) => {
  try {
    const { code, totalPrice } = req.body;

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

    if (!coupon) return res.status(400).json({ message: "Invalid or expired coupon" });

    if (new Date() > coupon.expiryDate)
      return res.status(400).json({ message: "This coupon has expired" });

    if (totalPrice < coupon.minPurchase)
      return res
        .status(400)
        .json({ message: `Minimum purchase ₹${coupon.minPurchase} required` });

    let discount = 0;
    if (coupon.discountType === "flat") {
      discount = coupon.discountValue;
    } else if (coupon.discountType === "percent") {
      discount = (totalPrice * coupon.discountValue) / 100;
    }

    res.json({
      valid: true,
      discount,
      finalPrice: Math.max(totalPrice - discount, 0),
      coupon,
    });
  } catch (err) {
    res.status(500).json({ message: "Error validating coupon", error: err.message });
  }
});

module.exports = router;