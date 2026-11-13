import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RequireLevel, { HomeRedirect } from './components/RequireLevel'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import MembersPage from './pages/MembersPage'
import MemberAccountsPage from './pages/MemberAccountsPage'
import LoansPage from './pages/LoansPage'
import LoanDetailPage from './pages/LoanDetailPage'
import DeductionsPage from './pages/DeductionsPage'
import DeductionRunPage from './pages/DeductionRunPage'
import RetirementPlansPage from './pages/RetirementPlansPage'
import SettingsPage from './pages/SettingsPage'
import ReportsPage from './pages/ReportsPage'
import PendingLoansPage from './pages/PendingLoansPage'
import CreditModelPage from './pages/CreditModelPage'
import AuditLogPage from './pages/AuditLogPage'
import StatementPage from './pages/StatementPage'
import ProfilePage from './pages/ProfilePage'
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
          <Route path="/dashboard" element={<HomeRedirect />} />

          {/* Every account: their loans, applying, their profile. */}
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/loans/apply" element={
              <Suspense fallback={<p className="text-sm text-brand-600">Loading…</p>}>
                <LoanApplicationPage />
              </Suspense>
            } />
          <Route path="/loans/:id" element={<LoanDetailPage />} />
          <Route path="/loans/:id/statement" element={<StatementPage />} />
          <Route path="/profile" element={<ProfilePage />} />

          <Route element={<RequireLevel min="loan_officer" />}>
            <Route path="/loans/pending" element={<PendingLoansPage />} />
            <Route path="/members" element={<MembersPage />} />
            <Route path="/member-accounts" element={<MemberAccountsPage />} />
            <Route path="/retirement-plans" element={<RetirementPlansPage />} />
          </Route>
          <Route element={<RequireLevel roles={['bookkeeper', 'treasurer', 'admin']} />}>
            <Route path="/deductions" element={<DeductionsPage />} />
            <Route path="/deductions/:id" element={<DeductionRunPage />} />
          </Route>
          <Route element={<RequireLevel min="treasurer" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route element={<RequireLevel min="crecom_chair" />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route element={<RequireLevel min="admin" />}>
            <Route path="/credit-model" element={<CreditModelPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
