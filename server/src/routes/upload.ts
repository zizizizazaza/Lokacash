import express from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authRequired } from '../middleware/auth.js';

const router = express.Router();

// Initialize S3 Client for Cloudflare R2
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${(process.env.R2_ACCOUNT_ID || '').trim()}.r2.cloudflarestorage.com`,
  forcePathStyle: true, // MUST BE TRUE for Cloudflare R2 to prevent SSL wildcard mismatch
  credentials: {
    accessKeyId: (process.env.R2_ACCESS_KEY_ID || '').trim(),
    secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY || '').trim(),
  },
});

// Configure Multer to upload directly to R2
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET_NAME || 'lokacash',
    acl: 'public-read', // R2 supports public-read if public access is enabled on the bucket
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req: express.Request, file: Express.Multer.File, cb: (error: any, key?: string) => void) {
      const ext = path.extname(file.originalname);
      // Create a unique filename: timestamp-uuid.ext
      const filename = `${Date.now()}-${uuidv4()}${ext}`;
      cb(null, `uploads/${filename}`);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// POST /api/upload
router.post('/', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // multer-s3 attaches the S3 URL to req.file.location, but for Cloudflare R2
  // we usually want to use the public custom domain URL if configured.
  // Fallback to the R2 public URL format if not provided.
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  let fileUrl = (req.file as any).location;

  if (publicDomain) {
    const filename = (req.file as any).key;
    fileUrl = `${publicDomain}/${filename}`;
  }

  const type = req.file.mimetype.startsWith('image/') ? 'image'
    : req.file.mimetype.startsWith('video/') ? 'video'
    : 'file';

  res.json({
    url: fileUrl,
    type,
    name: req.file.originalname,
    size: req.file.size
  });
});

export default router;
