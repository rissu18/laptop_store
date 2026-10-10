import type { ReactNode } from "react";
import { cx } from "@/components/ui/class-names";
import { RowCheckbox, SelectAllCheckbox } from "./bulk-actions";
import { EmptyState } from "./ui";

/**
 * Admini tabel (serverikomponent).
 * - Desktopil tavaline tabel; mobiilis (alla md) kaardid — 375px laiusel ei kuvata 12-veerulist tabelit.
 * - `mobile: "title"` veerg on kaardi pealkiri, "hidden" veerge mobiilis ei näidata.
 * - Valikukastid (bulk actions) seotakse vormiga `form` atribuudi kaudu — tabel jääb serverikomponendiks.
 */
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
  mobile?: "title" | "show" | "hidden";
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  /** Bulk-vormi id; kui antud, kuvatakse valikukastid */
  selectionForm?: string;
  empty?: { title: string; description?: ReactNode };
}

export function DataTable<T>({ rows, columns, rowKey, caption, selectionForm, empty }: DataTableProps<T>) {
  if (rows.length === 0) return <EmptyState title={empty?.title ?? "Midagi ei leitud"} description={empty?.description} />;
  const titleColumn = columns.find((c) => c.mobile === "title") ?? columns[0];
  const mobileColumns = columns.filter((c) => c !== titleColumn && c.mobile !== "hidden");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-surface-alt text-xs uppercase tracking-wide text-muted">
            <tr>
              {selectionForm && (
                <th scope="col" className="w-10 px-3 py-2.5">
                  <SelectAllCheckbox form={selectionForm} />
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} scope="col" className={cx("px-3 py-2.5 font-semibold whitespace-nowrap", column.align === "right" && "text-right", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-surface-alt">
                {selectionForm && (
                  <td className="px-3 py-2.5">
                    <RowCheckbox form={selectionForm} value={rowKey(row)} />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className={cx("px-3 py-2.5 align-top", column.align === "right" && "text-right tabular-nums", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start gap-3">
              {selectionForm && <RowCheckbox form={selectionForm} value={rowKey(row)} />}
              <div className="min-w-0 flex-1 font-medium">{titleColumn.cell(row)}</div>
            </div>
            {mobileColumns.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {mobileColumns.map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs text-muted">{column.header}</dt>
                    <dd className="truncate">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
