-- ============================================================
-- CRYPTO WORLD - SAFE MIGRATION (LEGACY -> CURRENT TRADE SCHEMA)
-- ============================================================
-- Run this script in Supabase SQL Editor.
-- It is idempotent and can be executed multiple times.

BEGIN;

-- 1) PROFILES
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'cash_balance'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN cash_balance NUMERIC NOT NULL DEFAULT 10000;
    END IF;
END $$;

UPDATE public.profiles
SET cash_balance = 10000
WHERE cash_balance IS NULL OR cash_balance <= 0;

ALTER TABLE public.profiles
    ALTER COLUMN cash_balance SET DEFAULT 10000;

ALTER TABLE public.profiles
    ALTER COLUMN cash_balance SET NOT NULL;

-- 2) POSITIONS (handles legacy avg_entry schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'side'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN side TEXT DEFAULT 'BUY';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'quantity'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN quantity NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'size'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN size NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'entry_price'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN entry_price NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'avg_entry'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN avg_entry NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'leverage'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN leverage NUMERIC DEFAULT 30;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'margin_required'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN margin_required NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN status TEXT DEFAULT 'open';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'exit_price'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN exit_price NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'pnl'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN pnl NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'opened_at'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN opened_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'closed_at'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN closed_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'stop_loss'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN stop_loss NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'take_profit'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN take_profit NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'positions' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.positions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

UPDATE public.positions
SET entry_price = avg_entry
WHERE (entry_price IS NULL OR entry_price = 0)
  AND avg_entry IS NOT NULL
  AND avg_entry > 0;

UPDATE public.positions
SET avg_entry = COALESCE(avg_entry, entry_price, 0)
WHERE avg_entry IS NULL;

UPDATE public.positions SET side = 'BUY' WHERE side IS NULL OR side NOT IN ('BUY', 'SELL');
UPDATE public.positions
SET side = UPPER(side)
WHERE side IS NOT NULL AND side <> UPPER(side);

UPDATE public.positions
SET quantity = size
WHERE (quantity IS NULL OR quantity = 0)
  AND size IS NOT NULL
  AND size > 0;

UPDATE public.positions
SET size = quantity
WHERE (size IS NULL OR size = 0)
  AND quantity IS NOT NULL
  AND quantity > 0;

UPDATE public.positions SET leverage = 30 WHERE leverage IS NULL OR leverage <= 0;
UPDATE public.positions SET margin_required = 0 WHERE margin_required IS NULL OR margin_required < 0;
UPDATE public.positions
SET status = LOWER(status)
WHERE status IS NOT NULL;
UPDATE public.positions
SET status = 'open'
WHERE status IS NULL OR status = '' OR status NOT IN ('open', 'closed');
UPDATE public.positions
SET entry_price = COALESCE(entry_price, avg_entry, 0)
WHERE entry_price IS NULL;
UPDATE public.positions
SET avg_entry = COALESCE(avg_entry, entry_price, 0)
WHERE avg_entry IS NULL;
UPDATE public.positions
SET opened_at = COALESCE(created_at, NOW())
WHERE opened_at IS NULL;
UPDATE public.positions SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.positions SET updated_at = NOW() WHERE updated_at IS NULL;

ALTER TABLE public.positions ALTER COLUMN side SET DEFAULT 'BUY';
ALTER TABLE public.positions ALTER COLUMN leverage SET DEFAULT 30;
ALTER TABLE public.positions ALTER COLUMN margin_required SET DEFAULT 0;
ALTER TABLE public.positions ALTER COLUMN status SET DEFAULT 'open';
ALTER TABLE public.positions ALTER COLUMN opened_at SET DEFAULT NOW();
ALTER TABLE public.positions ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.positions ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE public.positions ALTER COLUMN side SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN entry_price SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN avg_entry SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN leverage SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN margin_required SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN opened_at SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.positions ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.positions'::regclass
          AND conname = 'positions_side_check'
    ) THEN
        ALTER TABLE public.positions
        ADD CONSTRAINT positions_side_check CHECK (side IN ('BUY', 'SELL'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.positions'::regclass
          AND conname = 'positions_status_check'
    ) THEN
        ALTER TABLE public.positions
        ADD CONSTRAINT positions_status_check CHECK (status IN ('open', 'closed'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_positions_user ON public.positions(user_id);

WITH open_rows AS (
    SELECT
        p.id,
        p.user_id,
        p.symbol,
        COALESCE(NULLIF(p.quantity, 0), NULLIF(p.size, 0), 0) AS qty,
        COALESCE(NULLIF(p.avg_entry, 0), NULLIF(p.entry_price, 0), 0) AS avg_price,
        GREATEST(COALESCE(p.margin_required, 0), 0) AS margin_required,
        ROW_NUMBER() OVER (
            PARTITION BY p.user_id, p.symbol
            ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id DESC
        ) AS row_rank
    FROM public.positions p
    WHERE COALESCE(p.status, 'open') = 'open'
),
aggregated AS (
    SELECT
        user_id,
        symbol,
        SUM(qty) AS total_qty,
        CASE
            WHEN SUM(qty) > 0 THEN SUM(qty * avg_price) / SUM(qty)
            ELSE 0
        END AS weighted_avg,
        SUM(margin_required) AS total_margin
    FROM open_rows
    GROUP BY user_id, symbol
    HAVING COUNT(*) > 1
),
keepers AS (
    SELECT
        o.id,
        o.user_id,
        o.symbol,
        a.total_qty,
        a.weighted_avg,
        a.total_margin
    FROM open_rows o
    INNER JOIN aggregated a
        ON a.user_id = o.user_id
       AND a.symbol = o.symbol
    WHERE o.row_rank = 1
)
UPDATE public.positions p
SET quantity = GREATEST(k.total_qty, 0),
    size = GREATEST(k.total_qty, 0),
    avg_entry = COALESCE(NULLIF(k.weighted_avg, 0), p.avg_entry, p.entry_price, 0),
    entry_price = COALESCE(NULLIF(k.weighted_avg, 0), p.entry_price, p.avg_entry, 0),
    margin_required = GREATEST(k.total_margin, 0),
    status = 'open',
    updated_at = NOW()
FROM keepers k
WHERE p.id = k.id;

WITH ranked_open_positions AS (
    SELECT
        p.id,
        ROW_NUMBER() OVER (
            PARTITION BY p.user_id, p.symbol
            ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST, p.id DESC
        ) AS row_rank
    FROM public.positions p
    WHERE COALESCE(p.status, 'open') = 'open'
)
DELETE FROM public.positions p
USING ranked_open_positions r
WHERE p.id = r.id
  AND r.row_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS positions_user_symbol_open_idx
ON public.positions(user_id, symbol)
WHERE status = 'open';

-- 3) CLOSE POSITION RPC (atomic close + balance update)
CREATE OR REPLACE FUNCTION public.close_position(
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

    SELECT p.symbol,
           p.side,
           COALESCE(p.size, p.quantity, 0),
           COALESCE(p.avg_entry, p.entry_price)
      INTO v_symbol, v_side, v_size, v_entry_price
      FROM public.positions p
     WHERE p.id = p_position_id
       AND p.user_id = v_user_id
       AND COALESCE(p.status, 'open') = 'open'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Open position not found';
    END IF;

    IF v_entry_price IS NULL OR v_entry_price <= 0 THEN
        RAISE EXCEPTION 'Position avg_entry is invalid';
    END IF;

    IF v_size IS NULL OR v_size <= 0 THEN
        RAISE EXCEPTION 'Position size is invalid';
    END IF;

    IF UPPER(v_side) IN ('BUY', 'LONG') THEN
        v_pnl := (p_exit_price - v_entry_price) * v_size;
    ELSIF UPPER(v_side) IN ('SELL', 'SHORT') THEN
        v_pnl := (v_entry_price - p_exit_price) * v_size;
    ELSE
        RAISE EXCEPTION 'Unsupported side %', v_side;
    END IF;

    UPDATE public.positions
       SET status = 'closed',
           exit_price = p_exit_price,
           closed_at = NOW(),
           pnl = v_pnl,
           updated_at = NOW()
     WHERE id = p_position_id
       AND user_id = v_user_id;

    UPDATE public.profiles
       SET cash_balance = COALESCE(cash_balance, 0) + v_pnl
     WHERE id = v_user_id
     RETURNING cash_balance INTO v_new_cash_balance;

    IF v_new_cash_balance IS NULL THEN
        RAISE EXCEPTION 'Profile row not found for user';
    END IF;

    RETURN QUERY
    SELECT p_position_id, v_symbol, v_side, v_size, v_entry_price, p_exit_price, v_pnl, v_new_cash_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_position(UUID, NUMERIC) TO authenticated;

-- 4) ORDERS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN total NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'leverage'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN leverage NUMERIC DEFAULT 30;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'type'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN type TEXT DEFAULT 'MARKET';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN status TEXT DEFAULT 'filled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pnl'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN pnl NUMERIC;
    END IF;
END $$;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_side_check;

UPDATE public.orders
SET side = CASE
    WHEN side IS NULL THEN 'buy'
    WHEN lower(side) IN ('buy', 'long') THEN 'buy'
    WHEN lower(side) IN ('sell', 'short') THEN 'sell'
    ELSE side
END;

ALTER TABLE public.orders ADD CONSTRAINT orders_side_check CHECK (side IN ('buy', 'sell'));

ALTER TABLE public.orders ALTER COLUMN side SET NOT NULL;

UPDATE public.orders
SET total = quantity * price
WHERE total IS NULL;

UPDATE public.orders
SET leverage = 30
WHERE leverage IS NULL OR leverage <= 0;

UPDATE public.orders
SET type = 'MARKET'
WHERE type IS NULL OR type = '';

UPDATE public.orders
SET status = LOWER(status)
WHERE status IS NOT NULL;

UPDATE public.orders
SET status = 'filled'
WHERE status IS NULL OR status = '' OR status NOT IN ('open', 'filled', 'cancelled');

ALTER TABLE public.orders
ALTER COLUMN status SET DEFAULT 'filled';

UPDATE public.orders
SET status = 'filled'
WHERE status IS NULL;

ALTER TABLE public.orders
ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.orders ALTER COLUMN leverage SET DEFAULT 30;
ALTER TABLE public.orders ALTER COLUMN type SET DEFAULT 'MARKET';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND conname = 'orders_status_check'
    ) THEN
        ALTER TABLE public.orders
        ADD CONSTRAINT orders_status_check CHECK (status IN ('open', 'filled', 'cancelled'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);

COMMIT;

-- Force PostgREST schema cache refresh (fixes stale "column not found in schema cache" errors)
NOTIFY pgrst, 'reload schema';
