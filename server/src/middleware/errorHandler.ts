import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId || '-';

  if (err instanceof AppError) {
    console.error(`[Error] ${req.method} ${req.path} [${requestId}] ${err.statusCode}: ${err.message}`);
    res.status(err.statusCode).json({ error: err.message, requestId });
    return;
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    console.error(`[ValidationError] ${req.method} ${req.path} [${requestId}]`, err.message);
    res.status(400).json({ error: 'Validation error', details: (err as any).errors, requestId });
    return;
  }

  console.error(`[Error] ${req.method} ${req.path} [${requestId}]`, err.message);

  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(500).json({ error: message, requestId });
}
