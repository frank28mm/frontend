import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/Toast';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AppRouter from './AppRouter';
import { AssistantHost } from '@/components/assistant/AssistantHost';

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <ErrorBoundary>
          <ToastProvider>
            <ProfileProvider>
              <AssistantHost />
              <AppRouter />
            </ProfileProvider>
          </ToastProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
