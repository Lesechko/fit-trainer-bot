import { Context } from 'telegraf';
import { db } from '../../db';
import { BOT_USERNAME } from '../../config';
import {
  GENACCESS_USAGE,
  GENACCESS_CREATED,
  GENACCESS_ERROR,
  GENACCESS_CODE,
  GENACCESS_LINK,
} from '../../messages';
import { getCommandParts } from '../helpers';
import { generateAccessCode } from '../user/utils/accessCodeFormat';

export async function genAccessCodeCommandCallback(ctx: Context) {
  const parts = getCommandParts(ctx);
  if (parts.length > 2) {
    return ctx.reply(GENACCESS_USAGE);
  }

  const expiresDays = parts[1] ? Number(parts[1]) : NaN;

  try {
    const contextRes: any = await db.query(
      'SELECT c.id, c.slug FROM admin_context ac JOIN courses c ON c.id = ac.course_id WHERE ac.telegram_id = $1',
      [ctx.from!.id]
    );

    const course = contextRes.rows[0];

    if (!course) {
      return ctx.reply('⚠️ Спочатку встанови курс командою /setcourse <slug>');
    }

    const code = generateAccessCode();

    const expiresAt = Number.isFinite(expiresDays)
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      : null;

    await db.query(
      'INSERT INTO course_access_codes (code, course_id, expires_at) VALUES ($1, $2, $3)',
      [
        code,
        course.id,
        expiresAt ? expiresAt.toISOString() : null,
      ]
    );

    await ctx.reply(
      GENACCESS_CREATED(
        course.slug,
        code,
        expiresAt ? expiresAt.toISOString().split('T')[0] : null
      )
    );
    await ctx.reply(GENACCESS_CODE(code));

    if (BOT_USERNAME) {
      const link = `https://t.me/${BOT_USERNAME}?start=${code}`;

      return ctx.reply(GENACCESS_LINK(link));
    }
    return;
  } catch (e) {
    console.error(e);
    return ctx.reply(GENACCESS_ERROR);
  }
}
