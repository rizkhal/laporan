export function Step({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-[11px] font-mono font-medium text-muted-foreground">
        {number}
      </span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}
