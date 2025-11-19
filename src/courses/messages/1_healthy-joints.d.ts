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

export interface CourseMessages {
  welcome: string;
  days: {
    [key: string]: DayMessages;
  };
}

declare const messages: CourseMessages;
export default messages;

