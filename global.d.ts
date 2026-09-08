declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /* Переменные для Supabase */
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_ANON_KEY: string;

      /* Переменные для Finam API Proxy */
      FINAM_TLS_INSECURE?: string;
      NODE_TLS_REJECT_UNAUTHORIZED?: string;
      FINAM_API_SECRET: string;
      FINAM_ACCOUNT_ID: string;

      /* Системные переменные */
      NODE_ENV: 'development' | 'production' | 'test';

      // Добавляйте сюда новые переменные по мере роста проекта
    }
  }
}

// Этот пустой экспорт нужен, чтобы файл считался модулем
export {};
