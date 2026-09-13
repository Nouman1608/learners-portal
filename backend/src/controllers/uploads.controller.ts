import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';

export const uploadFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    // Generate URL for the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: fileUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadMultipleFiles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new AppError(400, 'No files uploaded');
    }

    const files = req.files.map((file) => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`,
    }));

    res.status(201).json({
      message: 'Files uploaded successfully',
      files,
    });
  } catch (error) {
    next(error);
  }
};
