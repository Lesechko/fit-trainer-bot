export type UserRow = {
  id: number;
  telegram_id: number;
  start_date: string;
  day: number;
};

export type UserDayRow = Pick<UserRow, 'day'>;

export type WhitelistRow = { telegram_id: number };

export type VideoRow = {
  id: number;
  day: number;
  file_id: string;
  created_at: string;
};

