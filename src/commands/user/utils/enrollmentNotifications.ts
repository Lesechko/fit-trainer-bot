import { Context, Telegraf } from 'telegraf';
import { COURSES } from '../../../config';
import { notifyAdminNewEnrollment } from '../../../services/userService';
import { START_DAY_1_BUTTON_TEXT } from '../../../messages';
import { CodeRow } from './enrollmentTypes';

export async function sendEnrollmentConfirmation(
  bot: Telegraf<Context>,
  ctx: Context,
  codeRow: CodeRow,
  startDate: string
): Promise<void> {
  await notifyAdminNewEnrollment(
    bot,
    {
      telegram_id: ctx.from!.id,
      username: ctx.from!.username || null,
      first_name: ctx.from!.first_name || null,
      last_name: ctx.from!.last_name || null,
    },
    codeRow.slug,
    startDate
  );

  const course = COURSES.find((c) => c.slug === codeRow.slug);

  if (course?.welcome) {
    const startButton = {
      text: START_DAY_1_BUTTON_TEXT,
      callback_data: `start_day_1_${codeRow.course_id}`,
    };

    await ctx.reply(course.welcome, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[startButton]],
      },
    });
  }
}
