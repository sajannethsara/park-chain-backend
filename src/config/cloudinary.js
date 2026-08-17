const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Setup multer storage for Cloudinary
const kybStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'kyb_documents',     // Cloudinary folder name
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
    resource_type: 'auto'
  }
});

const spotStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'spot_images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    resource_type: 'image'
  }
});

const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profile_images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    resource_type: 'image'
  }
});

const upload = multer({
  storage: kybStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Unsupported file type. Allowed types: PDF, JPG, JPEG, PNG.'), false);
    }
    cb(null, true);
  }
});
const spotUpload = multer({ storage: spotStorage });
const profileUpload = multer({ storage: profileStorage });

module.exports = {
  cloudinary,
  upload,
  spotUpload,
  profileUpload
};
