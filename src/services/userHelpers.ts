/**
 * Format user display name from user data
 */
export function formatUserDisplayName(user: {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  if (user.first_name) {
    let displayName = user.first_name;

    if (user.last_name) {
        displayName += ` ${user.last_name}`;
    }
   
    return displayName;
  } else if (user.username) {
    return `@${user.username}`;
  } else {
    return `ID:${user.telegram_id}`;
  }
}

