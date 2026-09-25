import type { WorkfoliApi } from '../../../packages/contracts';

declare global {
  interface Window { workfoli?: WorkfoliApi; }
}
export {};
