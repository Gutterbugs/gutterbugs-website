// Fetch Google reviews at build time via Places API (New)
const API_KEY = 'REDACTED';
const PLACE_ID = 'ChIJpfuUdkhwDIMR0rK-6PvfVJ8';

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
    const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
      },
    });

    if (!res.ok) throw new Error(`Places API ${res.status}`);

    const data = await res.json();

    const reviews: GoogleReview[] = (data.reviews || [])
      .filter((r: any) => r.rating === 5)
      .sort((a: any, b: any) => new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime())
      .map((r: any) => ({
        author: r.authorAttribution?.displayName || 'Anonymous',
        authorPhoto: r.authorAttribution?.photoUri || '',
        authorUri: r.authorAttribution?.uri || '',
        rating: r.rating,
        text: r.text?.text || '',
        relativeTime: r.relativePublishTimeDescription || '',
        publishTime: r.publishTime || '',
        googleMapsUri: r.googleMapsUri || '',
      }));

    return {
      rating: data.rating || 5,
      totalReviews: data.userRatingCount || 0,
      reviews,
    };
  } catch (err) {
    console.error('Failed to fetch Google reviews:', err);
    // Fallback to empty — component will handle gracefully
    return { rating: 5, totalReviews: 0, reviews: [] };
  }
}
