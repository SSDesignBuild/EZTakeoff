import type { MaterialItem } from '../lib/types';
import { materialCutGroups } from '../lib/materialCutPlan';
import { cadFeet } from '../lib/constructionCadScene';

export function MaterialCutDetails({ item }: { item: MaterialItem }) {
  const plan = item.cutPlan;
  if (!plan?.boards.length) return null;
  const count = plan.boards.reduce((sum, board) => sum + board.cuts.length, 0);
  const groups = materialCutGroups(plan);
  const mixedAllowances = plan.boards.some(board => (board.kerfIn ?? plan.kerfIn) !== plan.kerfIn || (board.trimIn ?? plan.trimIn) !== plan.trimIn);
  return <details className="material-cut-details" style={{ marginTop: 8, fontSize: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Cutting list · {count} cuts from {plan.boards.length} boards</summary>
    {item.unit === 'boards' && item.quantity !== plan.boards.length && <p role="note">The drawing requires {plan.boards.length} boards; this saved purchase order specifies {item.quantity}. Review the order adjustment before cutting.</p>}
    <p style={{ margin: '8px 0' }}>{mixedAllowances ? 'This order combines cut plans with different trim/kerf settings; see each stock assignment.' : `End trim ${plan.trimIn} in per stock board; saw kerf ${plan.kerfIn} in per cut.`} Lengths below are finished cuts.</p>
    <table aria-label={`${item.name} cutting list`} style={{ width: '100%', fontSize: 12 }}>
      <thead><tr><th>Qty</th><th>Cut length</th><th>Use / location</th></tr></thead>
      <tbody>{groups.map((cut, i) => <tr key={i}>
        <td>{cut.count}</td>
        <td title={`${(cut.lengthFt * 12).toFixed(4)} in`}>{cadFeet(cut.lengthFt * 12)}</td>
        <td>{cut.location}<details><summary>Piece references</summary>{cut.ids.join(', ')}</details></td>
      </tr>)}</tbody>
    </table>
    <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer' }}>Stock board assignments</summary>
      <table aria-label={`${item.name} stock assignments`} style={{ width: '100%', fontSize: 12 }}>
        <thead><tr><th>Board</th><th>Stock</th><th>Cuts in sequence</th><th>Trim / kerf</th><th>Offcut</th></tr></thead>
        <tbody>{plan.boards.map((board, i) => <tr key={i}><td>{i + 1}</td><td>{board.stockLengthFt} ft</td>
          <td style={{ overflowWrap: 'anywhere' }}>{board.cuts.map(cut => `${cut.id}: ${cadFeet(cut.lengthFt * 12)}`).join(' + ')}</td>
          <td>{board.trimIn ?? plan.trimIn} / {board.kerfIn ?? plan.kerfIn} in</td>
          <td>{cadFeet(board.remainderIn)}</td></tr>)}</tbody>
      </table>
    </details>
  </details>;
}
