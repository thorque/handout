/**
 * Joins class names and drops anything a CSS module did not define. Without it every call
 * site would have to cope with `styles.x` being `string | undefined`, which it is because
 * a CSS module is typed as an index signature.
 */
export function cx(...values: (string | false | undefined)[]): string {
  return values.filter((value) => typeof value === 'string' && value.length > 0).join(' ');
}
