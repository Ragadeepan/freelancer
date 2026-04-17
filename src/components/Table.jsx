import StatusBadge from "./StatusBadge.jsx";

export default function Table({ columns, rows, getRowKey }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden reveal-up">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-[0.2em] text-slate-400 backdrop-blur-sm sm:text-xs">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-3 font-semibold sm:px-5 sm:py-4">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowKey = getRowKey ? getRowKey(row, index) : index;
              return (
                <tr
                  key={rowKey}
                  className="border-t border-white/10 text-slate-200 transition hover:bg-white/10"
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-3 align-top sm:px-5 sm:py-4">
                      {cell?.type === "status" ? (
                        <StatusBadge status={cell.value} />
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
