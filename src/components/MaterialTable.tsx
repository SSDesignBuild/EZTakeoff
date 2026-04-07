import { MaterialItem } from '../lib/types';

interface MaterialTableProps {
  items: MaterialItem[];
}

export function MaterialTable({ items }: MaterialTableProps) {
  return (
    <div className="table-card">
      <div className="visual-header">
        <h3>Material order list</h3>
        <span>Grouped for field review and order prep</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Material</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Stock recommendation</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.category}-${item.name}`}>
                <td>{item.category}</td>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{item.unit}</td>
                <td>{item.stockRecommendation}</td>
                <td>{item.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
