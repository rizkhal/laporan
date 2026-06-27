import { FileText } from "lucide-react";

export function ReportTemplateSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Report Template</h2>
        <p className="text-sm text-muted-foreground">Customize the markdown template used for generated reports.</p>
      </div>
      <div className="surface rounded-xl px-6 py-16 text-center">
        <FileText className="mx-auto size-10 text-muted-foreground/40" />
        <h3 className="mt-4 font-semibold">Coming soon</h3>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
          Report templates will be available in a future update. You'll be able to design custom templates for your monthly reports.
        </p>
      </div>
    </div>
  );
}
