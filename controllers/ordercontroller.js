const Order = require('../models/order');
const Product = require('../models/product'); // ✅ Import Product model
const Coupon = require('../models/coupon');


// @desc Create new order
const createOrder = async (req, res) => {
  try {
    let {
      orderItems,
      shippingAddress,
      paymentMethod,
      status,
      estimatedDelivery,
      couponCode,
    } = req.body;

    console.log("Received orderItems:", orderItems);

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: "No order items" });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Not authorized, no user info" });
    }

    // ✅ Ensure every order item stores discountedPrice (if provided)
    const normalizedItems = [];

for (const item of orderItems) {
  const product = await Product.findById(item.product);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const variant = product.variants.find(
    (v) => v.size === item.size && v.color === item.color
  );

  if (!variant || variant.stock < item.qty) {
    return res.status(400).json({ message: "Variant out of stock" });
  }

  normalizedItems.push({
    name: product.name,
    qty: item.qty,
    price: product.price,               // ✅ DB PRICE
    discountedPrice: product.price,     // 🔒 coupon later
    image: product.images?.[0],
    product: item.product,
    size: item.size || null,
    color: item.color || null,
  });
}   const itemsPrice = normalizedItems.reduce(
  (acc, item) => acc + item.price * item.qty,
  0
);

const taxPrice = 0;
const shippingPrice = 0;

let discountAmount = 0;
let appliedCoupon = null;

if (couponCode) {
  const coupon = await Coupon.findOne({ code: couponCode });

  if (!coupon || !coupon.isActive) {
    return res.status(400).json({ message: "Invalid coupon" });
  }

  if (coupon.expiryDate && coupon.expiryDate < Date.now()) {
    return res.status(400).json({ message: "Coupon expired" });
  }

  if (coupon.minPurchase && itemsPrice < coupon.minPurchase) {
    return res.status(400).json({
      message: `Minimum purchase of ₹${coupon.minPurchase} required`,
    });
  }

  if (coupon.discountType === "percentage") {
    discountAmount = (itemsPrice * coupon.discountValue) / 100;
  }

  if (coupon.discountType === "flat") {
    discountAmount = coupon.discountValue;
  }

  discountAmount = Math.min(discountAmount, itemsPrice);
  appliedCoupon = coupon;
}

const totalPrice = itemsPrice - discountAmount;
    const order = new Order({
      user: req.user._id,
      orderItems: normalizedItems,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      status,
      estimatedDelivery,
      coupon: appliedCoupon ? appliedCoupon.code : null,
      discountAmount,
    });

    const createdOrder = await order.save();

    // ✅ Deduct stock for each product (variant-aware)
    for (const item of normalizedItems) {
      try {
        const product = await Product.findById(item.product);
        if (product) {
          if (product.variants && product.variants.length > 0) {
            const variant = product.variants.find(
              (v) =>
                v.size === item.size &&
                (!item.color || v.color === item.color)
            );

            if (variant) {
              variant.stock = Math.max(variant.stock - item.qty, 0);
            } else {
              console.warn(
                `⚠️ Variant not found for product ${item.product}, falling back to global stock`
              );
              product.countInStock = Math.max(
                product.countInStock - item.qty,
                0
              );
            }
          } else {
            product.countInStock = Math.max(product.countInStock - item.qty, 0);
          }
          await product.save();
        }
      } catch (stockErr) {
        console.error(
          `❌ Failed to update stock for product ${item.product}:`,
          stockErr.message
        );
      }
    }

    res.status(201).json(createdOrder);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    res
      .status(500)
      .json({ message: "Error creating order", error: err.message });
  }
};
// @desc Get logged-in user's orders
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });

    const formattedOrders = orders.map(order => ({
      ...order.toObject(),
      total: order.totalPrice, // ✅ alias for frontend
    }));

    res.json(formattedOrders);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching orders", error: err.message });
  }
};

// @desc Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email"
    );

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (
      order.user._id.toString() !== req.user._id.toString() &&
      !req.user.isAdmin
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching order", error: err.message });
  }
};

// @desc Mark order as paid
const markOrderPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = req.body.paymentResult || {};

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update order payment", error: err.message });
  }
};

// @desc Mark order as delivered (admin)
const markOrderDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ message: "Order not found" });

    order.isDelivered = true;
    order.deliveredAt = Date.now();

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to mark as delivered", error: err.message });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  markOrderPaid,
  markOrderDelivered,
};