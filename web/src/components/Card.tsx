import type { HTMLAttributes } from 'react';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * The plain surface for things that belong together: contour instead of shadow, 3 px
 * radius, 24 px padding — all of it in `.ho-card`, so this component is the class and a
 * place to hang children.
 */
export function Card({ className, ...rest }: CardProps) {
  const classes = className === undefined ? 'ho-card' : `ho-card ${className}`;
  return <div className={classes} {...rest} />;
}
