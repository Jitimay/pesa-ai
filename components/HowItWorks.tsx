import { t, type Locale } from "@/lib/i18n";

type Props = { locale: Locale };

export default function HowItWorks({ locale }: Props) {
  const steps = [
    { icon: "💬", titleKey: "step1Title" as const, descKey: "step1Desc" as const },
    { icon: "🧠", titleKey: "step2Title" as const, descKey: "step2Desc" as const },
    { icon: "🟡", titleKey: "step3Title" as const, descKey: "step3Desc" as const },
    { icon: "🔗", titleKey: "step4Title" as const, descKey: "step4Desc" as const },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16">
      <h2 className="text-2xl font-semibold">{t(locale, "howItWorks")}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        {steps.map((step, idx) => (
          <div key={step.titleKey} className="rounded-xl border border-pesa-border bg-pesa-card p-5">
            <div className="text-2xl">{step.icon}</div>
            <p className="mt-3 text-xs uppercase tracking-wide text-pesa-muted">Step {idx + 1}</p>
            <h3 className="mt-1 text-lg font-semibold">{t(locale, step.titleKey)}</h3>
            <p className="mt-2 text-sm text-pesa-muted">{t(locale, step.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
