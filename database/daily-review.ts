import { withDatabase } from './database';

export interface DailyReview {
  id: number;
  timestamp: number;
  social_did: string;
  social_wished: string;
  social_ratings: string;
  productivity_did: string;
  productivity_wished: string;
  productivity_ratings: string;
  wellness: string | null;
  news_types: string;
}

export interface DailyReviewInput {
  socialDid: string[];
  socialWished: string[];
  socialRatings: Record<string, number>;
  productivityDid: string[];
  productivityWished: string[];
  productivityRatings: Record<string, number>;
  wellness: string | null;
  newsTypes: string[];
}

export const saveDailyReview = async (data: DailyReviewInput): Promise<number> => {
  return withDatabase(async (db) => {
    const timestamp = Math.floor(Date.now() / 1000);
    
    const result = await db.runAsync(
      `INSERT INTO daily_reviews (
        timestamp, social_did, social_wished, social_ratings,
        productivity_did, productivity_wished, productivity_ratings,
        wellness, news_types
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        timestamp,
        JSON.stringify(data.socialDid),
        JSON.stringify(data.socialWished),
        JSON.stringify(data.socialRatings),
        JSON.stringify(data.productivityDid),
        JSON.stringify(data.productivityWished),
        JSON.stringify(data.productivityRatings),
        data.wellness,
        JSON.stringify(data.newsTypes),
      ]
    );
    
    return result.lastInsertRowId;
  }, 'saveDailyReview');
};

export const getDailyReviews = async (limit: number = 30): Promise<DailyReview[]> => {
  return withDatabase(async (db) => {
    const rows = await db.getAllAsync<DailyReview>(
      `SELECT * FROM daily_reviews ORDER BY timestamp DESC LIMIT ?`,
      [limit]
    );
    return rows;
  }, 'getDailyReviews');
};

export const getDailyReviewByDate = async (date: Date): Promise<DailyReview | null> => {
  return withDatabase(async (db) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const startTimestamp = Math.floor(startOfDay.getTime() / 1000);
    const endTimestamp = Math.floor(endOfDay.getTime() / 1000);
    
    const row = await db.getFirstAsync<DailyReview>(
      `SELECT * FROM daily_reviews WHERE timestamp >= ? AND timestamp <= ? LIMIT 1`,
      [startTimestamp, endTimestamp]
    );
    
    return row || null;
  }, 'getDailyReviewByDate');
};

export const deleteDailyReview = async (id: number): Promise<boolean> => {
  return withDatabase(async (db) => {
    const result = await db.runAsync(
      `DELETE FROM daily_reviews WHERE id = ?`,
      [id]
    );
    return result.changes > 0;
  }, 'deleteDailyReview');
};
