// Page buttons to show: first, last, and a window around the current page, with "…" for gaps.
export function pageList(current: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, current - 1, current, current + 1]);
  const nums = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export const PAGE_SIZES = [10, 25, 50, 100];
