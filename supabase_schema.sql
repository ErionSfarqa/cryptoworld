-- ═══════════════════════════════════════════════════════════
-- CRYPTO WORLD — Supabase Schema (Forex Terminal)
-- ═══════════════════════════════════════════════════════════

-- ─── 1. PROFILES ───
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  cash_balance NUMERIC NOT NULL DEFAULT 10000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ─── 2. POSITIONS (Forex Style) ───
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  size NUMERIC,
  entry_price NUMERIC NOT NULL CHECK (entry_price > 0),
  avg_entry NUMERIC NOT NULL CHECK (avg_entry > 0),
  exit_price NUMERIC,
  pnl NUMERIC,
  leverage NUMERIC NOT NULL DEFAULT 30,
  margin_required NUMERIC NOT NULL DEFAULT 0,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS positions_user_symbol_open_idx
ON positions(user_id, symbol)
WHERE status = 'open';

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own positions" ON positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own positions" ON positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own positions" ON positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own positions" ON positions FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION close_position(
  p_position_id UUID,
  p_exit_price NUMERIC
)
RETURNS TABLE (
  position_id UUID,
  symbol TEXT,
  side TEXT,
  size NUMERIC,
  entry_price NUMERIC,
  exit_price NUMERIC,
  pnl NUMERIC,
  new_cash_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_symbol TEXT;
  v_side TEXT;
  v_size NUMERIC;
  v_entry_price NUMERIC;
  v_pnl NUMERIC;
  v_new_cash_balance NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_exit_price IS NULL OR p_exit_price <= 0 THEN
    RAISE EXCEPTION 'Invalid exit price';
  END IF;

  SELECT p.symbol, p.side, COALESCE(p.size, p.quantity, 0), COALESCE(p.avg_entry, p.entry_price)
  INTO v_symbol, v_side, v_size, v_entry_price
  FROM positions p
  WHERE p.id = p_position_id
    AND p.user_id = v_user_id
    AND COALESCE(p.status, 'open') = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open position not found';
  END IF;

  IF UPPER(v_side) IN ('BUY', 'LONG') THEN
    v_pnl := (p_exit_price - v_entry_price) * v_size;
  ELSIF UPPER(v_side) IN ('SELL', 'SHORT') THEN
    v_pnl := (v_entry_price - p_exit_price) * v_size;
  ELSE
    RAISE EXCEPTION 'Unsupported side %', v_side;
  END IF;

  UPDATE positions
  SET status = 'closed',
      exit_price = p_exit_price,
      closed_at = NOW(),
      pnl = v_pnl,
      updated_at = NOW()
  WHERE id = p_position_id
    AND user_id = v_user_id;

  UPDATE profiles
  SET cash_balance = COALESCE(cash_balance, 0) + v_pnl
  WHERE id = v_user_id
  RETURNING cash_balance INTO v_new_cash_balance;

  RETURN QUERY
  SELECT p_position_id, v_symbol, v_side, v_size, v_entry_price, p_exit_price, v_pnl, v_new_cash_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION close_position(UUID, NUMERIC) TO authenticated;

-- ─── 3. ORDERS (History) ───
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  CONSTRAINT orders_side_check CHECK (side IN ('buy', 'sell')),
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  total NUMERIC,
  leverage NUMERIC DEFAULT 30,
  type TEXT DEFAULT 'MARKET',
  status TEXT NOT NULL DEFAULT 'filled' CHECK (status IN ('open', 'filled', 'cancelled')),
  pnl NUMERIC, -- Realized PnL if closing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── 4. WATCHLIST ───
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist" ON watchlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist" ON watchlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist" ON watchlist FOR DELETE USING (auth.uid() = user_id);
