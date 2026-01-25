export interface DayMessages {
  videoTitle: string;
  videoDescription: string;
  motivationMessage: string;
  difficultyChoice?: {
    message: string;
    easyButtonText: string;
    hardButtonText: string;
  };
}

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

export interface CourseMessages {
  welcome: string;
  siteGreeting: string;
  sitePaymentButtonText: string;
  instagramMessages?: {
    [messageId: string]: FlexibleMessage;
  };
  days: {
    [key: string]: DayMessages;
  };
}

declare const messages: CourseMessages;
export default messages;

