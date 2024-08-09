export interface FileCategoryResponse {
  category?: string;
  name?: string;
  error?: string;
  maxLimitBytes?: number;
  volatile?: boolean;
  durationMiliseconds?: number;
}
