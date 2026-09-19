import flags from './flags';

export { flags };
export * from './flags';

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  useFixtures: process.env.NEXT_PUBLIC_USE_FIXTURES || 'auto',
  flags,
};

export default config;
