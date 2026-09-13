import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Courses from './pages/Courses';
import Enrollments from './pages/Enrollments';
import Leads from './pages/Leads';
import MessageTemplates from './pages/MessageTemplates';
import Fees from './pages/Fees';
import Calendar from './pages/Calendar';
import Assessments from './pages/Assessments';
import TakeAssessment from './pages/TakeAssessment';
import GradeAssessment from './pages/GradeAssessment';
import MyResults from './pages/MyResults';
import MyCourses from './pages/MyCourses';
import MyTeacherCourses from './pages/MyTeacherCourses';
import MyFees from './pages/MyFees';
import MyInvoices from './pages/MyInvoices';
import Invoices from './pages/Invoices';
import Logs from './pages/Logs';
import Attendance from './pages/Attendance';
import TeamsSettings from './pages/TeamsSettings';
import AccountSettings from './pages/AccountSettings';
import Analytics from './pages/Analytics';
import ParentPortal from './pages/ParentPortal';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin']}>
                <Layout>
                  <Users />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/courses"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <Courses />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/enrollments"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <Enrollments />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/leads"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin']}>
                <Layout>
                  <Leads />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/message-templates"
            element={
              <ProtectedRoute allowedRoles={['sudo']}>
                <Layout>
                  <MessageTemplates />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/fees"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <Fees />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <Layout>
                  <Calendar />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assessments"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher', 'student']}>
                <Layout>
                  <Assessments />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assessments/:id/take"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <TakeAssessment />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/assessments/:id/grade"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <GradeAssessment />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-results"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <MyResults />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-courses"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <MyCourses />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-teaching-courses"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <Layout>
                  <MyTeacherCourses />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-fees"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <MyFees />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/my-invoices"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <MyInvoices />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <Layout>
                  <Invoices />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/logs"
            element={
              <ProtectedRoute allowedRoles={['sudo']}>
                <Layout>
                  <Logs />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <Layout>
                  <Attendance />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings/teams"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <TeamsSettings />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/account-settings"
            element={
              <ProtectedRoute allowedRoles={['student', 'teacher']}>
                <Layout>
                  <AccountSettings />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute allowedRoles={['sudo', 'admin', 'teacher']}>
                <Layout>
                  <Analytics />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/parent-portal"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Layout>
                  <ParentPortal />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Redirect root to dashboard */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <h1 className="text-6xl font-bold text-gray-900">404</h1>
                  <p className="text-gray-600 mt-4">Page not found</p>
                  <a
                    href="/dashboard"
                    className="mt-6 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Go to Dashboard
                  </a>
                </div>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
