export const questionInvitation =
  /приглаша[\p{L}]*|приглашен[\p{L}]*|собеседован[\p{L}]*|\b(?:invite[sd]?|invitations?|interviews?)\b|साक्षात्कार|आमंत्रित|面试|邀请/iu;

export const questionAction =
  /https?:|www\.|tg:\/\/|t\.me\/|@[\p{L}\p{N}_]+|\b(?:send|provide|complete|fill|click|follow|book|schedule|join|reply|confirm|calls?|contact|assignments?|forms?|take (?:a|the) test)\b|пришлите|отправьте|заполните|перейдите|пройдите|свяжитесь|позвоните|ответьте|подтвердите|задани[\p{L}]*|анкет[\p{L}]*|भेजें|भरें|संपर्क करें|कॉल करें|请(?:填写|发送|提供|参加|回复)|表单|问卷|作业|通话/iu;
