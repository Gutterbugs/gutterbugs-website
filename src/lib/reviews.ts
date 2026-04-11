// Fetch Google reviews from the Cloudflare Worker (cached in D1 from GMB API)
const WORKER_URL =
  import.meta.env.PUBLIC_FORM_ENDPOINT || 'https://gutterbugs-form.ryan-1f9.workers.dev';

export interface GoogleReview {
  author: string;
  authorPhoto: string;
  authorUri: string;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime: string;
  googleMapsUri: string;
}

export interface PlaceInfo {
  rating: number;
  totalReviews: number;
  reviews: GoogleReview[];
}

export async function fetchGoogleReviews(): Promise<PlaceInfo> {
  try {
    const res = await fetch(`${WORKER_URL}/reviews`);
    if (!res.ok) throw new Error(`Worker /reviews ${res.status}`);
    const data = await res.json();
    return {
      rating: data.rating ?? 5,
      totalReviews: data.totalReviews ?? 0,
      reviews: data.reviews ?? [],
    };
  } catch (err) {
    console.error('Failed to fetch reviews from worker:', err);
    return { rating: 5, totalReviews: 0, reviews: [] };
  }
}
