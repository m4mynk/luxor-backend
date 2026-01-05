const express = require('express');
const router = express.Router();
const cloudinary = require('../utils/cloudinary');
const multer = require('multer');
const streamifier = require('streamifier');

// Setup multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', upload.single('image'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No file uploaded' });

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: 'luxor-products' },
    (error, result) => {
      if (error) {
        return res.status(500).json({ message: 'Upload failed', error });
      }
      res.json({ url: result.secure_url });
    }
  );

  streamifier.createReadStream(file.buffer).pipe(uploadStream);
});

module.exports = router;