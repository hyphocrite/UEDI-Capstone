import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import MembersPage from './pages/MembersPage'
import LoansPage from './pages/LoansPage'
import LoanDetailPage from './pages/LoanDetailPage'
import RetirementPlansPage from './pages/RetirementPlansPage'
import SettingsPage from './pages/SettingsPage'
import ReportsPage from './pages/ReportsPage'
import PendingLoansPage from './pages/PendingLoansPage'
import CreditModelPage from './pages/CreditModelPage'
import NotFoundPage from './pages/NotFoundPage'

// Loaded on demand: it carries the OCR and PDF libraries.
const LoanApplicationPage = lazy(() => import('./pages/LoanApplicationPage'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Navigate to="/members" replace />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/loans/apply" element={
              <Suspense fallback={<p className="text-sm text-brand-600">Loading…</p>}>
                <LoanApplicationPage />
              </Suspense>
            } />
          <Route path="/loans/pending" element={<PendingLoansPage />} />
          <Route path="/credit-model" element={<CreditModelPage />} />
          <Route path="/loans/:id" element={<LoanDetailPage />} />
          <Route path="/retirement-plans" element={<RetirementPlansPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
