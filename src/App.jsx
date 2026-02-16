import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CrearPedido from './pages/CrearPedido';
import Login from './pages/Login';
import ListaPedidos from './pages/ListaPedidos';
import DetallePedido from './pages/DetallePedido';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter basename="/pedidosb3">
      <Routes>
        <Route path="/" element={<CrearPedido />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<ProtectedRoute><ListaPedidos /></ProtectedRoute>} />
        <Route path="/admin/pedido/:id" element={<ProtectedRoute><DetallePedido /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
