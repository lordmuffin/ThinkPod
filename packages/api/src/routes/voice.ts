import express, { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

// Voice transcription
router.post('/transcribe', asyncHandler(async (req: Request, res: Response) => {
  // Placeholder for voice transcription functionality
  res.json({
    success: true,
    message: 'Voice transcription endpoint - to be implemented',
  });
}));

export default router;