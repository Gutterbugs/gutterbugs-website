CREATE TABLE IF NOT EXISTS reviews (
  review_id TEXT PRIMARY KEY,
  reviewer_name TEXT,
  photo_url TEXT,
  star_rating INTEGER,
  comment TEXT,
  reply_comment TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  service_type TEXT,
  message TEXT,
  gclid TEXT,
  source TEXT,
  landing_page TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  synced_to_mc INTEGER DEFAULT 0
);
