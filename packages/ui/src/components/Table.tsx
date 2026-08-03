import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}

/** Canonical enterprise table shell: `bg-white rounded-xl border overflow-hidden`. */
export function Table({ className = '', children, ...rest }: TableProps) {
  return (
    <div
      className={
        'bg-white rounded-xl border border-gray-200 overflow-hidden ' +
        (className ? ' ' + className : '')
      }
    >
      <table className={'w-full text-sm ' + (className ? '' : '')} {...rest}>
        {children}
      </table>
    </div>
  );
}

export interface TableHeaderProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode;
}

export function TableHeader({
  className = '',
  children,
  ...rest
}: TableHeaderProps) {
  return (
    <thead
      className={
        'border-b border-gray-200 bg-gray-50 text-gray-400 text-xs uppercase tracking-wider ' +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {children}
    </thead>
  );
}

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function TableHead({
  align = 'left',
  className = '',
  children,
  ...rest
}: TableHeadProps) {
  const alignClass =
    align === 'right' ? ' text-right' : align === 'center' ? ' text-center' : ' text-left';
  return (
    <th
      scope="col"
      className={'px-4 py-3 font-medium ' + alignClass + (className ? ' ' + className : '')}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TableBodyProps
  extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode;
}

export function TableBody({ className = '', children, ...rest }: TableBodyProps) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children?: ReactNode;
  hover?: boolean;
  selected?: boolean;
  cursor?: boolean;
}

export function TableRow({
  hover = true,
  selected = false,
  cursor = false,
  className = '',
  children,
  ...rest
}: TableRowProps) {
  return (
    <tr
      className={
        'border-b border-gray-100 ' +
        (hover ? 'hover:bg-gray-50 ' : '') +
        (selected ? 'bg-blue-50 ' : '') +
        (cursor ? 'cursor-pointer ' : '') +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {children}
    </tr>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function TableCell({
  align = 'left',
  className = '',
  children,
  ...rest
}: TableCellProps) {
  const alignClass =
    align === 'right' ? ' text-right' : align === 'center' ? ' text-center' : ' text-left';
  return (
    <td className={'px-4 py-3 ' + alignClass + (className ? ' ' + className : '')} {...rest}>
      {children}
    </td>
  );
}

export default Table;
