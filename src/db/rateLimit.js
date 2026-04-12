const pool = require('./index');

pool.query(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    window_start BIGINT NOT NULL
  )
`).catch(console.error);

// Returns true if the key is over the limit, and increments the count.
async function checkRateLimit(key, maxCount, windowMs) {
  const now = Date.now();
  const result = await pool.query(`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES ($1, 1, $2)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start + $3 <= $2 THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start + $3 <= $2 THEN $2
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `, [key, now, windowMs]);

  const { count, window_start } = result.rows[0];
  const msLeft = (Number(window_start) + windowMs) - now;
  return { limited: count > maxCount, count, msLeft };
}

module.exports = { checkRateLimit };
