import QuestionDetail from '@/pages/QuestionDetail';
import { useLocation, useSearchParams } from 'react-router-dom';
export function QuestionDetailRoute() {
  const [params] = useSearchParams();
  const location = useLocation();
  const submissionId = params.get('submissionId') || (location.state as { submissionId?: string } | null)?.submissionId || '';
  return <QuestionDetail key={submissionId} />;
}
