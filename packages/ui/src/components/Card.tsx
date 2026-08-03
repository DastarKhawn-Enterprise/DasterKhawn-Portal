import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Card shell flavor. Defaults to the canonical enterprise card. */
  variant?: 'default' | 'nested' | 'plain';
}

export interface CardHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<CardProps['variant']>, string> = {
  default: 'bg-card border border-card-border rounded-xl',
  nested: 'bg-background-secondary border border-border-light rounded-xl',
  plain: 'bg-card rounded-xl',
};

export function Card({
  variant = 'default',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div className={VARIANT_CLASSES[variant] + (className ? ' ' + className : '')} {...rest}>
      {children}
    </div>
  );
}

/**
 * Card header: title row (optionally bordered) + optional action cluster.
 * When `bordered`, renders a `border-b` divider below the header.
 */
export function CardHeader({
  title,
  description,
  actions,
  children,
  className = '',
  ...rest
}: CardHeaderProps & { bordered?: boolean }) {
  const bordered = (rest as { bordered?: boolean }).bordered ?? false;
  const wrapped = children ?? (
    <>
      <div className="min-w-0">
        {title !== undefined && (
          <h3 className="text-sm font-semibold text-gray-700 truncate">{title}</h3>
        )}
        {description !== undefined && (
          <p className="mt-0.5 text-xs text-gray-500 truncate">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </>
  );
  return (
    <div
      className={
        'flex items-center justify-between gap-3 px-4 py-3' +
        (bordered ? ' border-b border-gray-200' : '') +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {wrapped}
    </div>
  );
}

export function CardBody({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div className={'p-4' + (className ? ' ' + className : '')} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={
        'flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200' +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
