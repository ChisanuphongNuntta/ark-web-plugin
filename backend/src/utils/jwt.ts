import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const jwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  return secret;
};

export interface TokenPayload {
  userId: string;
}

export const generateToken = (userId: string): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: JWT_EXPIRES_IN } as any);
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, jwtSecret()) as TokenPayload;
};
