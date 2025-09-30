import { Context, Telegraf } from 'telegraf';
import { db } from '../db';
import { START_OK, USER_SAVE_ERROR, NOT_REGISTERED, PROGRAM_COMPLETED, dayCaption } from '../messages';
import { calculateProgramDay } from '../utils';

export function startCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const telegramId = ctx.from.id;
  const startDate = new Date().toISOString().split('T')[0];

  db.query(
    'INSERT INTO users (telegram_id, start_date) VALUES ($1, $2) ON CONFLICT (telegram_id) DO NOTHING',
    [telegramId, startDate]
  )
    .then(() => {
      ctx.reply(START_OK);
    })
    .catch((err: Error) => {
      console.error(err.message);
      ctx.reply(USER_SAVE_ERROR);
    });
}

export function dayCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }
  
  const telegramId = ctx.from.id;
  
  // Get user's start date
  db.query('SELECT start_date FROM users WHERE telegram_id = $1', [
    telegramId,
  ])
    .then((result: any) => {
      const row = result.rows[0];
      if (row?.start_date) {
        const day = calculateProgramDay(row.start_date);

        // Get video for this day
        return db.query('SELECT file_id FROM videos WHERE day = $1', [day])
          .then((videoResult: any) => {
            const videoRow = videoResult.rows[0];
            
            if (videoRow?.file_id) {
              ctx.replyWithVideo(videoRow.file_id, {
                caption: dayCaption(day),
              });
            } else {
              ctx.reply(PROGRAM_COMPLETED);
            }
          });
      } else {
        ctx.reply(NOT_REGISTERED);
      }
    })
    .catch((err: Error) => {
      console.error('Error fetching user:', err);
      ctx.reply(NOT_REGISTERED);
    });
}



