"use client";

import { LOCALES, type Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
  onChange: (l: Locale) => void;
};

export default function LocaleSwitcher({ locale, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          title={l.label}
          className={`rounded px-2 py-1 text-xs transition
            ${locale === l.code
              ? "bg-pesa-accent text-black font-semibold"
              : "text-pesa-muted hover:text-pesa-text"
            }`}
        >
          {l.flag} {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
