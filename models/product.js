const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true, trim: true },

    // ✅ Normalize categories
    category: { 
      type: String, 
      required: true, 
      trim: true, 
      enum: ['t-shirts', 'shirts', 'jeans', 'trousers', 'hoodies']
    },

    description: { type: String, required: true },

    // ✅ Thumbnail (main image)
    image: { type: String, required: true },

    // ✅ All product images
    images: { type: [String], default: [] },

    // ❌ Remove old sizes/colors & countInStock
    // ✅ Variants with size + color + stock
    variants: [
      {
        size: { type: String, required: true },
        color: { type: String, required: true },
        stock: { type: Number, required: true, default: 0 }
      }
    ],

    // ✅ Reviews
    reviews: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        name: { type: String, required: true },
        rating: { type: Number, required: true },
        comment: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    numReviews: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },

    // ✅ Inventory (price is still global)
    price: { type: Number, required: true },

    // ✅ Admin controls
    isFeatured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },

    // ✅ NEW: color-specific galleries (e.g. { "Black": ["url1","url2"], "Red": [...] })
    imagesByColor: {
      type: Map,
      of: [String],
      default: undefined,
    },

    // ✅ Bring back global fallback stock so legacy UI & order fallback keep working
    // (used when variants are missing or a variant isn’t found)
    countInStock: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ Indexes for faster filtering/search
productSchema.index({ category: 1, brand: 1, active: 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);