const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authMiddleware = require('../middleware/AuthMiddleware');
const KybController = require('../controllers/KybController');
const { upload } = require('../config/cloudinary');

// Rate limit: 10 requests per hour per IP/device
const kybLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many KYB submissions from this device. Please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const handleUpload = (req, res, next) => {
  upload.single('document')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds the 5 MB limit.' });
      }
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    next();
  });
};

// 1. Submit KYB for Business Account (Seller adding a spot)
// Expected Request payload:
// form-data fields: entityName, address, googleMapsLink, spotType
// file upload under field name: document
router.post('/', authMiddleware, kybLimiter, handleUpload, KybController.submitKyb);

module.exports = router;
