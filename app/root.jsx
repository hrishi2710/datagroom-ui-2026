import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MainPage from './MainPage';
import LoginPage from './components/LoginPage';
import NewDsFromDsPage from './pages/AllDs/NewDsFromDsPage';
import NewDsFromXlsPage from './pages/AllDs/NewDsFromXlsPage';
import NewDsFromCsvPage from './pages/AllDs/NewDsFromCsvPage';
import DsViewPage from './pages/DsView/DsViewPage';
import DsEditLogPage from './pages/DsEditLog/DsEditLogPage';
import DsViewEditPage from './pages/DsViewEdit/DsViewEditPage';
import DsAttachmentsPage from './pages/DsAttachments/DsAttachmentsPage';
import DsBulkEditPage from './pages/DsBulkEdit/DsBulkEditPage';
import PATManager from './pages/Settings/PATManager';
import SidebarLayout from './SidebarLayout';
import { useAuth } from './auth/AuthProvider';

function DsViewWithLayout() {
    const auth = useAuth();
    return (
        <SidebarLayout onLogout={() => { auth.logout(); window.location.href = '/login'; }}>
            <div style={{ position: 'relative', width: '100%', margin: '0 auto', padding: '0 20px' }}>
                <DsViewPage currentUserId={auth.userId} />
            </div>
        </SidebarLayout>
    );
}

function PATManagerWithLayout() {
    const auth = useAuth();
    return (
        <SidebarLayout onLogout={() => { auth.logout(); window.location.href = '/login'; }}>
            <div style={{ position: 'relative', width: '100%', margin: '0 auto', padding: '0 20px' }}>
                <PATManager />
            </div>
        </SidebarLayout>
    );
}

function DsEditLogWithLayout() {
    const auth = useAuth();
    return (
        <SidebarLayout onLogout={() => { auth.logout(); window.location.href = '/login'; }}>
            <div style={{ position: 'relative', width: '100%', margin: '0 auto', padding: '0 20px' }}>
                <DsEditLogPage />
            </div>
        </SidebarLayout>
    );
}

function DsViewEditWithLayout() {
    const auth = useAuth();
    return (
        <SidebarLayout onLogout={() => { auth.logout(); window.location.href = '/login'; }}>
            <div style={{ position: 'relative', width: '100%', margin: '0 auto', padding: '0 20px' }}>
                <DsViewEditPage />
            </div>
        </SidebarLayout>
    );
}

export function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><MainPage /></RequireAuth>} />
            <Route path="/dsViewEdit/:dsName/:dsView" element={<RequireAuth><DsViewEditWithLayout /></RequireAuth>} />
            <Route path="/dsEditLog/:dsName" element={<RequireAuth><DsEditLogWithLayout /></RequireAuth>} />
            <Route path="/dsAttachments/:dsName" element={<RequireAuth><DsAttachmentsPage /></RequireAuth>} />
            <Route path="/dsBulkEdit/:dsName" element={<RequireAuth><DsBulkEditPage /></RequireAuth>} />
            <Route path="/ds/:dsName/:dsView/:filter" element={<RequireAuth><DsViewWithLayout /></RequireAuth>} />
            <Route path="/ds/:dsName/:dsView" element={<RequireAuth><DsViewWithLayout /></RequireAuth>} />
            <Route path="/ds/new-from-ds" element={<RequireAuth><NewDsFromDsPage /></RequireAuth>} />
            <Route path="/ds/new-from-xls" element={<RequireAuth><NewDsFromXlsPage /></RequireAuth>} />
            <Route path="/ds/new-from-csv" element={<RequireAuth><NewDsFromCsvPage /></RequireAuth>} />
            <Route path="/settings/pats" element={<RequireAuth><PATManagerWithLayout /></RequireAuth>} />
        </Routes>
    );
}

export default function App() {
    const queryClient = React.useMemo(() => new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
            },
        },
    }), []);
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </QueryClientProvider>
    );
}
