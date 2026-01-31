/**
 * Types for Instagram funnel messages (follow-ups, feedback responses, reminders).
 * Used by instagram/1_healthy-joints.json and messageHelpers.
 */
export interface FlexibleMessage {
  text: string;
  buttons?: Array<{
    text: string;
    callback_data?: string;
    url?: string;
    responseMessageId?: string;
  }>;
  followUpMessages?: Array<{
    messageId: string;
    delay: string;
  }>;
}

export type InstagramMessages = {
  [messageId: string]: FlexibleMessage;
};
