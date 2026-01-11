const Product = require("../models/product");

// @desc    Create a new product (admin only)
// @desc    Create a new product (admin only)
const createProduct = async (req, res) => {
  try {
    const {
      name,
      brand,
      category,
      description,
      price,
      countInStock,
      isFeatured,
      active,
      images = [],
    } = req.body;
    // Accept imagesByColor as object OR JSON string (optional)
let imagesByColor;
if (req.body.imagesByColor) {
  try {
    imagesByColor =
      typeof req.body.imagesByColor === "string"
        ? JSON.parse(req.body.imagesByColor)
        : req.body.imagesByColor;
  } catch {
    imagesByColor = undefined;
  }
}

    // ✅ Parse variants properly (handles FormData case)
    let variants = [];
    if (req.body.variants) {
      let raw = req.body.variants;

      if (typeof raw === "string") {
        try {
          // if it's a stringified JSON array, parse it once
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            variants = parsed;
          } else {
            variants = [parsed]; // single object
          }
        } catch (err) {
          console.warn("❌ Could not parse variants JSON:", raw);
          variants = [];
        }
      } else if (Array.isArray(raw)) {
        // if backend received array directly (edge case)
        variants = raw.map((v) =>
          typeof v === "string" ? JSON.parse(v) : v
        );
      }
    }

    // ✅ Ensure stock values are numbers
    variants = variants.map((v) => ({
      size: v.size,
      color: v.color,
      stock: Number(v.stock) || 0,
    }));

    // ✅ Handle uploaded file from Multer (Cloudinary)
    let uploadedImage = req.file ? req.file.path : null;

    // ✅ Normalize images
    let allImages = [];
    if (typeof images === "string") {
      try {
        allImages = JSON.parse(images);
      } catch {
        allImages = [images];
      }
    } else if (Array.isArray(images)) {
      allImages = images;
    }

    // ✅ Add uploaded file if exists
    if (uploadedImage) {
      allImages.unshift(uploadedImage);
    }

    // ✅ First image = thumbnail (fallback if none)
    const thumbnail =
      allImages[0] || "https://via.placeholder.com/400x400.png?text=No+Image";

    const product = new Product({
      name,
      brand,
      category,
      description,
      image: thumbnail,
      images: allImages,
      imagesByColor, // optional map { "Black": ["url1","url2"], ... }
      price,
      countInStock,
      isFeatured: isFeatured || false,
      active: active !== undefined ? active : true,
      variants,
    });

    await product.save();
    res
      .status(201)
      .json({ message: "Product created successfully", product });
  } catch (err) {
    console.error("❌ Error creating product:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc    Get all products (with filters: category, color, price, search, active)
const getProducts = async (req, res) => {
  try {
    const { category, color, minPrice, maxPrice, search, active } = req.query;

    const query = {};

    // ✅ Active filter
    if (active !== undefined) {
      query.active = active === "true";
    }

    // ✅ Category filter (map Men/Women to actual categories)
    if (category) {
      if (category.toLowerCase() === "men") {
        query.category = { $in: ["t-shirts", "shirts", "jeans", "trousers"] };
      } else if (category.toLowerCase() === "women") {
        query.category = { $in: ["t-shirts", "shirts"] };
      } else if (category.toLowerCase() !== "all") {
        query.category = { $regex: new RegExp(category, "i") };
      }
    }

    // ✅ Color filter
    if (color && color.toLowerCase() !== "all") {
      query.colors = { $regex: new RegExp(color, "i") };
    }

    // ✅ Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    // ✅ Search filter
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { brand: new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    console.error("❌ Error fetching products:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc    Get single product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    console.error("❌ Error fetching product by ID:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc    Delete a product by ID (admin only)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting product:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// @desc    Update a product by ID (admin only)
const updateProduct = async (req, res) => {
  try {
    
    const {
      name,
      brand,
      category,
      description,
      price,
      countInStock,
      isFeatured,
      active,
      images = [],
    } = req.body;
    // Accept imagesByColor as object OR JSON string (optional)
let imagesByColor;
if (req.body.imagesByColor) {
  try {
    imagesByColor =
      typeof req.body.imagesByColor === "string"
        ? JSON.parse(req.body.imagesByColor)
        : req.body.imagesByColor;
  } catch {
    imagesByColor = undefined;
  }
}

// ✅ Parse variants properly (handles FormData JSON string)
let variants;
if (req.body.variants) {
  if (typeof req.body.variants === "string") {
    try {
      const parsed = JSON.parse(req.body.variants);
      variants = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
      return res.status(400).json({ message: "Invalid variants format" });
    }
  } else if (Array.isArray(req.body.variants)) {
    variants = req.body.variants;
  }
}

// ✅ Normalize variant fields
if (variants) {
  variants = variants.map((v) => ({
    size: v.size,
    color: v.color,
    stock: Number(v.stock) || 0,
  }));
}

    // ✅ Handle uploaded file
    let uploadedImage = req.file ? req.file.path : null;

    // ✅ Normalize images
    let allImages = [];
    if (typeof images === "string") {
      try {
        allImages = JSON.parse(images);
      } catch {
        allImages = [images];
      }
    } else if (Array.isArray(images)) {
      allImages = images;
    }

    if (uploadedImage) {
      allImages.unshift(uploadedImage);
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        brand,
        category,
        description,
        image:
          allImages[0] ||
          "https://via.placeholder.com/400x400.png?text=No+Image",
        images: allImages.length > 0 ? allImages : undefined,
        imagesByColor: imagesByColor !== undefined ? imagesByColor : undefined,
        price,
        countInStock,
        isFeatured,
        active: active !== undefined ? active : undefined,
        variants, // ✅ NEW
      },
      { new: true, runValidators: true }
    );

    if (!updated)
      return res.status(404).json({ message: "Product not found" });

    res.json({ message: "Product updated successfully", product: updated });
  } catch (err) {
    console.error("❌ Error updating product:", err);
    res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  deleteProduct,
  updateProduct,
};