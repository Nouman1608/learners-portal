import { JWTPayload } from '../config/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & {
        id: string;
      };
    }
  }
}

export {};
