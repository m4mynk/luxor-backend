const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const Product = require('../models/product');

// ⬇️ Import controller functions
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/productcontroller');

// ⬇️ Import Multer upload instance
const { singleImage } = require('../middleware/multer');


// ✅ CREATE a product (admin only)
router.post(
  '/',
  protect,
  adminMiddleware,
  (req, res, next) => {
    singleImage(req, res, (err) => {
      if (err) {
        console.error("❌ Multer error:", err);
        return res.status(400).json({ message: "Multer failed", error: err.message });
      }
      console.log("🟢 Multer passed, file:", req.file);
      console.log("🟢 Multer passed, body:", req.body);
      next();
    });
  },
  createProduct
);

// ✅ Upload only an image (for admin product forms)
router.post(
  '/upload',
  protect,
  adminMiddleware,
  singleImage,   // ✅ same upload instance
  (req, res) => {
    try {
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      res.status(200).json({ url: req.file.path }); // ✅ Cloudinary URL
    } catch (err) {
      console.error('❌ Image upload error:', err);
      res.status(500).json({ message: 'Image upload failed', error: err.message });
    }
  }
);

// ✅ GET all products (public)
router.get('/', getProducts);

// ✅ GET all products (admin only)
router.get('/admin', protect, adminMiddleware, getProducts);

// ✅ GET product by ID (admin only)
router.get('/admin/:id', protect, adminMiddleware, getProductById);

// ✅ GET product by ID (public)
router.get('/:id', getProductById);

// ✅ SEED a test product
router.get('/seed-product', async (req, res) => {
  try {
    const newProduct = await Product.create({
      name: 'Luxor Premium Hoodie',
      brand: 'Luxor',
      category: 'hoodies',
      description: 'Premium cotton hoodie with stylish fit.',
      image: '/images/hoodie.jpg',
      images: [
        '/images/hoodie.jpg',
        '/images/hoodie-back.jpg',
        '/images/hoodie-zoom.jpg',
      ],
      price: 1999,
      countInStock: 50,
      isFeatured: true,
    });

    res.json({ message: 'Product seeded ✅', product: newProduct });
  } catch (err) {
    res.status(500).json({ message: '❌ Seeding failed', error: err.message });
  }
});

// ✅ UPDATE a product (admin only)
router.put('/:id', protect, adminMiddleware, singleImage, updateProduct);

// ✅ DELETE a product (admin only)
router.delete('/:id', protect, adminMiddleware, deleteProduct);

// ✅ BULK DELETE products (admin only)
router.delete('/', protect, adminMiddleware, async (req, res) => {
  try {
    const { ids } = req.body; // expects { ids: ["id1", "id2", ...] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No product IDs provided' });
    }

    const result = await Product.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `Deleted ${result.deletedCount} products`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("❌ Error bulk deleting products:", err);
    res.status(500).json({ message: 'Error deleting products', error: err.message });
  }
});

// ✅ GET only stock count for a product
router.get('/:id/stock', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('countInStock');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ countInStock: product.countInStock });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ POST product review (with duplicate check & auto avg rating)
router.post('/:id/reviews', protect, async (req, res) => {
  const { rating, comment } = req.body;

  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // ✅ Prevent duplicate review
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReviewed) {
      return res.status(400).json({ message: 'You already reviewed this product' });
    }

    // ✅ Create review
    const review = {
      user: req.user._id,
      name: req.user.name,
      rating: Number(rating),
      comment,
    };

    product.reviews.push(review);

    // ✅ Update stats
    product.numReviews = product.reviews.length;
    product.averageRating =
      product.reviews.reduce((acc, r) => acc + r.rating, 0) / product.numReviews;

    await product.save();

    res.status(201).json({ message: '✅ Review added', product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '❌ Error adding review', error: err.message });
  }
});

module.exports = router;