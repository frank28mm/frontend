import type { QuestionCard } from '@/services/types';
import type { PresentationQuestion } from '@/utils/questionPresentation';

export const questionCardFromPresentation = (question: PresentationQuestion): QuestionCard => {
  const source = question as PresentationQuestion & {
    question_text?: string;
    question_content?: string;
  };
  const content = String(source.question_content || source.question_text || '').trim();
  return {
    ...source,
    ...(content ? { question_content: content } : {}),
  } as QuestionCard;
};
