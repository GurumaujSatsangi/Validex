import express from "express";
import multer from "multer";
import path from "path";
import { ingestPdf } from "../services/pdfIngestionService.js";

const router = express.Router();

// Configure multer for PDF uploads only
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

/**
 * POST /api/upload/providers-pdf
 * Upload and parse a scanned PDF of healthcare providers
 * 
 * Request:
 *   - Multipart form-data
 *   - Field: 'file' (PDF file)
 * 
 * Response:
 *   {
 *     success: true,
 *     providersInserted: number,
 *     runId: string,
 *     message: string
 *   }
 */
router.post('/providers-pdf', upload.single('file'), async (req, res) => {
  try {
    // Verify file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    if (req.file.size === 0) {
      return res.status(400).json({ error: 'PDF file is empty' });
    }

    console.info('[PDF Upload] Processing file:', req.file.originalname, 'Size:', req.file.size, 'bytes');

    // Ingest PDF and return results
    const result = await ingestPdf(req.file.buffer, req.file.originalname);

    res.json({
      success: true,
      providersInserted: result.providersInserted,
      runId: result.runId,
      message: `Successfully processed PDF and imported ${result.providersInserted} providers. Validation run started: ${result.runId}`
    });
  } catch (error) {
    console.error('[PDF Upload] Error:', error.message || error);
    
    // Handle multer file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File size exceeds 50MB limit' });
    }

    // Handle multer file type error
    if (error.message && error.message.includes('Only PDF')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ 
      error: error.message || 'Failed to process PDF',
      details: error.details || undefined
    });
  }
});

export default router;
