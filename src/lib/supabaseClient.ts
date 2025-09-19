import { createClient } from '@supabase/supabase-js'

// 🔹 Feste Werte direkt hier definiert (Variante 1)
export const VITE_SUPABASE_URL = 'https://lzcbjciqrhsezxkjeyhb.supabase.co'
export const VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6Y2JqY2lxcmhzZXp4a2pleWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMzUxNTIsImV4cCI6MjA2OTgxMTE1Mn0.Ak7qF9uZ7u9E48pkhlK5C4hyKQv6U5poOQAaO0K-cB8'

// 🔹 Supabase Client
export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
