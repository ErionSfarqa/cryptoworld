//  Crypto World Config 
// DEBUG toggle: set to true to enable verbose console logs
export const DEBUG = true;

export const SUPABASE_URL = "https://hdbucprfxnegpbhjftpa.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkYnVjcHJmeG5lZ3BiaGpmdHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5OTA4NjgsImV4cCI6MjA4NjU2Njg2OH0.4-Dml3FFFIONlY-L0pH00xPU9LEbHecYEprdfj_QcCw";

export const BINANCE_BASE = "https://api.binance.com/api/v3";

export function log(...args) {
  if (DEBUG) console.log("[CW]", ...args);
}

