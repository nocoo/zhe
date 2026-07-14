/**
 * Barcode pattern for login card header.
 * Per Basalt B-1 spec: standalone component with standard bar pattern.
 */
const BARS: ReadonlyArray<{ id: string; w: number; dim: boolean }> = [
  { id: "bar-0", w: 2, dim: false },
  { id: "bar-1", w: 1, dim: true },
  { id: "bar-2", w: 3, dim: true },
  { id: "bar-3", w: 1, dim: false },
  { id: "bar-4", w: 2, dim: true },
  { id: "bar-5", w: 1, dim: true },
  { id: "bar-6", w: 1, dim: false },
  { id: "bar-7", w: 3, dim: true },
  { id: "bar-8", w: 1, dim: true },
  { id: "bar-9", w: 2, dim: false },
  { id: "bar-10", w: 1, dim: true },
  { id: "bar-11", w: 3, dim: true },
  { id: "bar-12", w: 2, dim: false },
  { id: "bar-13", w: 1, dim: true },
  { id: "bar-14", w: 1, dim: true },
  { id: "bar-15", w: 2, dim: false },
  { id: "bar-16", w: 3, dim: true },
  { id: "bar-17", w: 1, dim: true },
  { id: "bar-18", w: 2, dim: false },
  { id: "bar-19", w: 1, dim: true },
];

export function Barcode() {
  return (
    <div className="flex items-stretch gap-[1.5px] h-full">
      {BARS.map((bar) => (
        <div
          key={bar.id}
          className="rounded-[0.5px] bg-primary-foreground"
          style={{ width: `${bar.w * 1.5}px`, opacity: bar.dim ? 0.5 : 0.9 }}
        />
      ))}
    </div>
  );
}
