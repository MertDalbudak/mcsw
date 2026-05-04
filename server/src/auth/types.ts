import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}

export interface CurrentUser {
  id: string;
  email: string;
  isAdmin: boolean;
  emailVerified: boolean;
}

export {};
