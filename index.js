const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const userRoutes = require('./routes/user');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const cookieParser = require('cookie-parser');


const { normalizeProducts } = require('./utils/normalizeProducts');

// Middlewares
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/users', userRoutes);

// Request logger
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl}`);
  next();
});
// Test route
app.get('/', (req, res) => {
  res.send('🟢 LuxorClothing backend is running!');
});

const paymentRoutes = require("./routes/payment");
app.use("/api/payment", paymentRoutes);

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes); // ✅ this is correct
const productRoutes = require('./routes/product'); // 1. Import
app.use('/api/products', productRoutes);           // 2. Mount
// Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI, {
  dbName: 'luxor-backend', // 👈 FORCES correct DB name
})
.then(() => {
  console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);

  // 🔧 Run normalization once at startup
  normalizeProducts();

  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
})
.catch((err) => {
  console.error("❌ MongoDB connection error:", err.message);
});

const orderRoutes = require('./routes/order');
app.use('/api/orders', orderRoutes);

const couponRoutes = require("./routes/coupon");
app.use("/api/coupons", couponRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

const uploadRoutes = require('./routes/upload');
app.use('/api/upload', uploadRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});