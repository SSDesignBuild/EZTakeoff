import { MaterialItem } from '../lib/types';

interface MaterialTableProps {
  items: MaterialItem[];
}

export function MaterialTable({ items }: MaterialTableProps) {
  const grouped = items.reduce<Record<string, MaterialItem[]>>((accumulator, item) => {
    accumulator[item.category] = accumulator[item.category] ?? [];
    accumulator[item.category].push(item);
    return accumulator;
  }, {});

  return (
    <div className="table-card">
      <div className="visual-header">
        <h3>Material order list</h3>
        <span>Grouped by family and board length for faster ordering</span>
      </div>
      <div className="stack-list material-groups">
        {Object.entries(grouped).map(([category, categoryItems]) => (
          <div key={category} className="material-group">
            <div className="material-group-header">
              <h4>{category}</h4>
              <span>{categoryItems.length} line items</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Stock recommendation</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryItems.map((item) => (
                    <tr key={`${item.category}-${item.name}`}>
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
        ))}
      </div>
    </div>
  );
}
