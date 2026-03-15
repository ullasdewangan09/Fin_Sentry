export function ScanLoader({ text = "ANALYZING..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="w-48 h-1 bg-muted rounded-full overflow-hidden scan-line">
        <div className="h-full w-1/3 bg-primary rounded-full" />
      </div>
      <span className="font-mono text-xs text-muted-foreground tracking-widest">{text}</span>
    </div>
  );
}
