import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Home from '@/pages/Home';
import Camera from '@/pages/Camera';
import Upload from '@/pages/Upload';
import Result from '@/pages/Result';
import ResultSummary from '@/pages/ResultSummary';
import { QuestionDetailRoute } from '@/components/QuestionDetailRoute';
import AITutor from '@/pages/AITutor';
import DataArchive from '@/pages/DataArchive';
import ReviewFlow from '@/pages/ReviewFlow';
import History from '@/pages/History';
import Analysis from '@/pages/Analysis';
import ReportDetail from '@/pages/ReportDetail';
import ReportGenerating from '@/pages/ReportGenerating';
import ReportHistory from '@/pages/ReportHistory';
import PlanHistory from '@/pages/PlanHistory';
import PlanDetail from '@/pages/PlanDetail';
import Mine from '@/pages/Mine';
import MineApiKeys from '@/pages/MineApiKeys';
import Login from '@/pages/Login';
import Subscribe from '@/pages/Subscribe';
import ProfileManagement from '@/pages/ProfileManagement';
import MinePersonalInfo from '@/pages/MinePersonalInfo';
import MineHelpFeedback from '@/pages/MineHelpFeedback';
import MinePrivacyPolicy from '@/pages/MinePrivacyPolicy';
import MineUserAgreement from '@/pages/MineUserAgreement';
import MineAbout from '@/pages/MineAbout';
import MineRedemptions from '@/pages/MineRedemptions';
import Admin from '@/pages/Admin';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '@/components/ui/PageTransition';

// Helper Wrapper for Transitions
const RouteTransition = ({ children }: { children: React.ReactNode }) => (
    <PageTransition>{children}</PageTransition>
);

const AssistantConversation = () => <div className="min-h-screen bg-neu-bg" aria-hidden="true" />;

const AppRouter = () => {
    const location = useLocation();

    return (
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                <Route path="/" element={<RouteTransition><Home /></RouteTransition>} />
                <Route path="/scan" element={<RouteTransition><Camera /></RouteTransition>} />
                <Route path="/upload" element={<RouteTransition><Upload /></RouteTransition>} />
                <Route path="/result" element={<RouteTransition><Result /></RouteTransition>} />
                <Route path="/result-summary" element={<RouteTransition><ResultSummary /></RouteTransition>} />
                <Route path="/question/:id" element={<RouteTransition><QuestionDetailRoute /></RouteTransition>} />
                <Route path="/ai-tutor/:id" element={<RouteTransition><AITutor /></RouteTransition>} />
                <Route path="/data" element={<RouteTransition><DataArchive /></RouteTransition>} />
                <Route path="/data/category/:tag" element={<RouteTransition><ReviewFlow /></RouteTransition>} />
                <Route path="/history" element={<RouteTransition><History /></RouteTransition>} />
                <Route path="/history/:submissionId" element={<RouteTransition><ResultSummary /></RouteTransition>} />
                <Route path="/analysis" element={<RouteTransition><Analysis /></RouteTransition>} />
                <Route path="/report-history" element={<RouteTransition><ReportHistory /></RouteTransition>} />
                <Route path="/assistant" element={<RouteTransition><AssistantConversation /></RouteTransition>} />
                <Route path="/plans" element={<RouteTransition><PlanHistory /></RouteTransition>} />
                <Route path="/plan/:id" element={<RouteTransition><PlanDetail /></RouteTransition>} />
                <Route path="/report-generating/:id" element={<RouteTransition><ReportGenerating /></RouteTransition>} />
                <Route path="/report/:id" element={<RouteTransition><ReportDetail /></RouteTransition>} />
                <Route path="/mine" element={<RouteTransition><Mine /></RouteTransition>} />
                <Route path="/profiles" element={<RouteTransition><ProfileManagement /></RouteTransition>} />
                <Route path="/mine/personal" element={<RouteTransition><MinePersonalInfo /></RouteTransition>} />
                <Route path="/mine/api-keys" element={<RouteTransition><MineApiKeys /></RouteTransition>} />
                <Route path="/mine/help" element={<RouteTransition><MineHelpFeedback /></RouteTransition>} />
                <Route path="/mine/privacy" element={<RouteTransition><MinePrivacyPolicy /></RouteTransition>} />
                <Route path="/mine/agreement" element={<RouteTransition><MineUserAgreement /></RouteTransition>} />
                <Route path="/mine/about" element={<RouteTransition><MineAbout /></RouteTransition>} />
                <Route path="/mine/redemptions" element={<RouteTransition><MineRedemptions /></RouteTransition>} />
                <Route path="/login" element={<RouteTransition><Login /></RouteTransition>} />
                <Route path="/subscribe" element={<RouteTransition><Subscribe /></RouteTransition>} />
                <Route path="/admin" element={<RouteTransition><Admin /></RouteTransition>} />
            </Routes>
        </AnimatePresence>
    );
};

export default AppRouter;
