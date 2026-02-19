import { ShoppingCart, BarChart, CalendarDays } from 'lucide-react';

const cards = [
  { key: 'totalPedidos', label: 'Total Pedidos', icon: ShoppingCart, color: 'blue', format: v => v },
  { key: 'totalFacturado', label: 'Total Facturado', icon: BarChart, color: 'indigo', format: v => `${v.toFixed(2)} €` },
  { key: 'pedidosMes', label: 'Pedidos este mes', icon: CalendarDays, color: 'purple', format: v => v }
];

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  green: 'bg-green-50 text-green-600',
  purple: 'bg-purple-50 text-purple-600'
};

export default function EstadisticasAdmin({ stats }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {cards.map(({ key, label, icon: Icon, color, format }) => (
        <div key={key} className={`bg-white rounded-lg shadow-md p-5 flex items-center gap-4 ${stats.filtrado ? 'ring-2 ring-blue-300' : ''}`}>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{label} {stats.filtrado && <span className="text-blue-500 text-xs">(filtrado)</span>}</p>
            <p className="text-xl font-bold text-gray-900">{format(stats[key])}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
