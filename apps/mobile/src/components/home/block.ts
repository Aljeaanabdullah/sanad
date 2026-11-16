/** One independently loaded block of the Home screen. */
export type Block<T> = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: T };
