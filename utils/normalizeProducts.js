// utils/normalizeProducts.js
const Product = require("../models/product");

const allowedCategories = ["t-shirts", "shirts", "jeans", "trousers", "hoodies"];

const categoryMap = {
  tshirt: "t-shirts",
  tshirts: "t-shirts",
  t: "t-shirts",
  "t-shirt": "t-shirts",
  shirt: "shirts",
  shirts: "shirts",
  jean: "jeans",
  jeans: "jeans",
  trouser: "trousers",
  trousers: "trousers",
  hoodie: "hoodies",
  hoodies: "hoodies",
  clothing: "t-shirts",
  skaff: "shirts",
};

const normalize = (val, map) => {
  if (!val) return val;
  const clean = val.toString().trim().toLowerCase();
  return map[clean] || clean;
};

const normalizeProducts = async () => {
  try {
    const products = await Product.find();
    let updatedCount = 0;

    for (let product of products) {
      let changed = false;

      const newCategory = normalize(product.category, categoryMap);
      if (newCategory !== product.category) {
        product.category = newCategory;
        changed = true;
      }

      if (product.colors && product.colors.length > 0) {
        const newColors = product.colors.map((c) => normalize(c, {}));
        if (JSON.stringify(newColors) !== JSON.stringify(product.colors)) {
          product.colors = newColors;
          changed = true;
        }
      }

      // ✅ Enforce allowed categories
      if (product.category && !allowedCategories.includes(product.category)) {
        console.log(`⚠️ Product ${product._id} has invalid category "${product.category}". Resetting to "t-shirts".`);
        product.category = "t-shirts";
        changed = true;
      }

      if (changed) {
        await product.save();
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`🛠 Normalized ${updatedCount} products`);
    }
  } catch (err) {
    console.error("❌ Error normalizing products:", err.message);
  }
};

// ✅ New: normalize single product input before saving
const normalizeProductInput = (body) => {
  if (body.category) {
    body.category = normalize(body.category, categoryMap);

    // ✅ Enforce allowed categories on new/updated product
    if (!allowedCategories.includes(body.category)) {
      throw new Error(
        `Invalid category "${body.category}". Allowed: ${allowedCategories.join(", ")}`
      );
    }
  }
  if (body.colors && Array.isArray(body.colors)) {
    body.colors = body.colors.map((c) => normalize(c, {}));
  }
  return body;
};

module.exports = {
  normalizeProducts,
  normalizeProductInput,
  allowedCategories, // ✅ export in case frontend needs dropdown
};