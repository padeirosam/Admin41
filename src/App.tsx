import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Revendas } from './pages/Revendas';
import { RevendaForm } from './pages/RevendaForm';
import { Administradores } from './pages/Administradores';
import { Logs } from './pages/Logs';
import { Profile } from './pages/Profile';
import { AccessProfiles } from './pages/AccessProfiles';
import { WowzaServers } from './pages/WowzaServers';
import { Configuracoes } from './pages/Configuracoes';
import { RevendaPlans } from './pages/RevendaPlans';
import { StreamingPlans } from './pages/StreamingPlans';
import { Streamings } from './pages/Streamings';
import { StreamingForm } from './pages/StreamingForm';
import { Layout } from './components/Layout';
import { Toaster } from './components/Toaster';

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
        <Router basename="/">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/revendas" element={<Revendas />} />
                      <Route path="/revendas/nova" element={<RevendaForm />} />
                      <Route path="/revendas/:id/editar" element={<RevendaForm />} />
                      <Route path="/planos-revenda" element={<RevendaPlans />} />
                      <Route path="/planos-streaming" element={<StreamingPlans />} />
                      <Route path="/streamings" element={<Streamings />} />
                      <Route path="/streamings/nova" element={<StreamingForm />} />
                      <Route path="/streamings/:id/editar" element={<StreamingForm />} />
                      <Route path="/servidores" element={<WowzaServers />} />
                      <Route path="/administradores" element={<Administradores />} />
                      <Route path="/perfis" element={<AccessProfiles />} />
                      <Route path="/configuracoes" element={<Configuracoes />} />
                      <Route path="/logs" element={<Logs />} />
                      <Route path="/perfil" element={<Profile />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster />
        </Router>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;