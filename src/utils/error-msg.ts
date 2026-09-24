import {messages} from '../custom/messages.js';

export default (error?: string | Error): string => {
  let str = messages.unknownError;

  if (error) {
    if (typeof error === 'string') {
      str = `${messages.errorPrefix}${error}`;
    } else if (error instanceof Error) {
      str = `${messages.errorPrefix}${error.message}`;
    }
  }

  return str;
};
