// Embedded environment configuration for production build
// This file contains the environment variables needed for the application to run

const embeddedEnvironment = {
  NODE_ENV: 'production',

  // AI Services - PLACEHOLDER: Set real credentials in .env file
  GOOGLE_AI_API_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
  OPENAI_API_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',

  // AWS S3 Configuration - PLACEHOLDER: Set real credentials in .env file
  AWS_ACCESS_KEY_ID: 'PLACEHOLDER_SET_IN_ENV_FILE',
  AWS_SECRET_ACCESS_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
  AWS_REGION: 'ap-south-1',
  S3_BUCKET_NAME: 'tallykaro-client-data',
  S3_ENCRYPTION_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',

  // Supabase Configuration - PLACEHOLDER: Set real credentials in .env file
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',
  SUPABASE_SERVICE_ROLE_KEY: 'PLACEHOLDER_SET_IN_ENV_FILE',

  // PostgreSQL Connection - PLACEHOLDER: Set real credentials in .env file
  POSTGRES_HOST: 'db.your-project.supabase.co',
  POSTGRES_PORT: '5432',
  POSTGRES_DB: 'postgres',
  POSTGRES_USER: 'postgres',
  POSTGRES_PASSWORD: 'PLACEHOLDER_SET_IN_ENV_FILE',

  // WhatsApp Optimization Settings
  CACHE_EXPIRY_MINUTES: '30',
  CONTEXT_EXPIRY_MINUTES: '10',
  MAX_SEARCH_RESULTS: '10'
};

module.exports = embeddedEnvironment;