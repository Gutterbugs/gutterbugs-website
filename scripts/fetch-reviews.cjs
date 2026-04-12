#!/usr/bin/env node
/**
 * fetch-reviews.js — Pull all Google Business Profile reviews
 * and write them to src/data/reviews.json for the Astro build.
 *
 * Usage: node scripts/fetch-reviews.js
 *
 * Requires env vars (or falls back to hardcoded for now):
 *   GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN
 */

const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.GBP_CLIENT_ID;
const CLIENT_SECRET = process.env.GBP_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GBP_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('❌ Missing env vars: GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN');
  process.exit(1);
}

const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'reviews.json');

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function apiGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function listAccounts(token) {
  return apiGet('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', token);
}

async function listLocations(token, accountName) {
  // accountName is like "accounts/123456789"
  return apiGet(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress`,
    token
  );
}

async function listReviews(token, accountId, locationId, pageToken) {
  let url = `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=50`;
  if (pageToken) url += `&pageToken=${pageToken}`;
  return apiGet(url, token);
}

async function main() {
  console.log('🔑 Refreshing access token...');
  const token = await getAccessToken();
  console.log('✅ Token acquired');

  // Step 1: Find account
  console.log('📋 Listing accounts...');
  const accounts = await listAccounts(token);
  console.log(`Found ${accounts.accounts?.length || 0} account(s)`);
  
  if (!accounts.accounts?.length) {
    throw new Error('No GBP accounts found. Check API permissions.');
  }

  // Try each account to find the one with locations
  let accountId, locationId, foundAccount, foundLocation;
  
  for (const account of accounts.accounts) {
    const accName = account.name;
    const accId = accName.split('/')[1];
    console.log(`  Checking account: ${account.accountName || accName} (${accId})`);
    
    try {
      const locations = await listLocations(token, accName);
      if (locations.locations?.length) {
        foundAccount = account;
        accountId = accId;
        // List all locations and pick the one that's NOT Fulham (main Tring location)
        for (const loc of locations.locations) {
          const locTitle = loc.title || loc.name;
          console.log(`    📍 ${locTitle} (${loc.name.split('/')[1]})`);
        }
        // Prefer non-Fulham location, or fallback to first
        foundLocation = locations.locations.find(l => !(l.title || '').toLowerCase().includes('fulham')) || locations.locations[0];
        locationId = foundLocation.name.split('/')[1];
        console.log(`  ✅ Found ${locations.locations.length} location(s)`);
        break;
      } else {
        console.log(`  (no locations)`);
      }
    } catch (e) {
      console.log(`  (error: ${e.message})`);
    }
  }

  if (!accountId || !locationId) {
    throw new Error('No locations found in any account. Check API permissions.');
  }

  console.log(`Using account: ${foundAccount.accountName || foundAccount.name} (${accountId})`);
  console.log(`Using location: ${foundLocation.title || foundLocation.name} (${locationId})`);

  // Step 3: Fetch ALL reviews (paginated)
  console.log('⭐ Fetching reviews...');
  let allReviews = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    const result = await listReviews(token, accountId, locationId, pageToken);
    const reviews = result.reviews || [];
    allReviews.push(...reviews);
    pageToken = result.nextPageToken;
    console.log(`  Page ${page}: ${reviews.length} reviews (total: ${allReviews.length})`);
  } while (pageToken);

  console.log(`\n📊 Total reviews fetched: ${allReviews.length}`);

  // Step 4: Transform to clean format
  const cleanReviews = allReviews.map(r => ({
    id: r.reviewId,
    author: r.reviewer?.displayName || 'Anonymous',
    profilePhoto: r.reviewer?.profilePhotoUrl || null,
    rating: starRatingToNumber(r.starRating),
    text: r.comment || '',
    time: r.createTime,
    updateTime: r.updateTime,
    reply: r.reviewReply ? {
      text: r.reviewReply.comment,
      time: r.reviewReply.updateTime,
    } : null,
  }));

  // Sort by date, newest first
  cleanReviews.sort((a, b) => new Date(b.time) - new Date(a.time));

  // Calculate summary stats
  const totalRating = cleanReviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = cleanReviews.length > 0 ? (totalRating / cleanReviews.length).toFixed(1) : '0';
  const ratingBreakdown = [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: cleanReviews.filter(r => r.rating === stars).length,
  }));

  const output = {
    fetchedAt: new Date().toISOString(),
    totalReviews: cleanReviews.length,
    averageRating: parseFloat(avgRating),
    ratingBreakdown,
    reviews: cleanReviews,
  };

  // Step 5: Write to file
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ Written ${cleanReviews.length} reviews to ${OUTPUT_PATH}`);
  console.log(`⭐ Average rating: ${avgRating}/5`);
  ratingBreakdown.forEach(rb => {
    console.log(`   ${'★'.repeat(rb.stars)}${'☆'.repeat(5 - rb.stars)} ${rb.count}`);
  });
}

function starRatingToNumber(starRating) {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[starRating] || 5;
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
