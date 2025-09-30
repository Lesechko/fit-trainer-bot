import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from '../config';
import { db } from '../db';
import { WhitelistRow } from '../types';
import {
  ADMIN_ONLY_ADD,
  ADMIN_ONLY_LIST,
  ADDUSER_USAGE,
  ADDUSER_BAD_ID,
  ADDUSER_ERROR,
  addUserOk,
  LIST_ERROR,
  LIST_EMPTY,
  listUsers,
} from '../messages';
import { isAdmin } from '../utils';

export function addUserCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }
  
  if (!isAdmin(ctx)) {
    return ctx.reply(ADMIN_ONLY_ADD);
  }

  const text = (ctx.message as any)?.text as string | undefined;

  if (!text) {
    return ctx.reply(ADDUSER_USAGE);
  }
  
  const parts = text.trim().split(/\s+/);

  if (parts.length !== 2) {
    return ctx.reply(ADDUSER_USAGE);
  }

  const newUserId = Number(parts[1]);

  if (!Number.isFinite(newUserId)) {
    return ctx.reply(ADDUSER_BAD_ID);
  }

  db.query(
    'INSERT INTO whitelist (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING',
    [newUserId]
  )
    .then(() => {
      ctx.reply(addUserOk(newUserId));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(ADDUSER_ERROR);
    });
}

export function listUsersCommandCallback(ctx: Context) {
  if (!ctx.from) {
    return;
  }
  
  if (!isAdmin(ctx)) {
    return ctx.reply(ADMIN_ONLY_LIST);
  }

  db.query('SELECT telegram_id FROM whitelist')
    .then((result: any) => {
      const rows = result.rows as WhitelistRow[];

      if (!rows || rows.length === 0) {
        return ctx.reply(LIST_EMPTY);
      }
      
      const list = rows.map((r) => String(r.telegram_id)).join('\\n');
      return ctx.reply(listUsers(list));
    })
    .catch((err: Error) => {
      console.error(err);
      ctx.reply(LIST_ERROR);
    });
}



