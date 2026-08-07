import LeadersLogo from "./LeadersLogo";

const FEATURES = [
  "Spend, ROAS והכנסות לכל מותג — בזמן אמת",
  "ייחוס הכנסות מהחנות לכל ערוץ ולכל קמפיין",
  "ביצועי קמפיינים, קריאייטיבים ותחזיות סוף-חודש",
];

// Split-screen auth layout: brand hero on the left, form card on the right.
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-bg" dir="rtl">
      {/* Hero (right side in RTL) */}
      <div className="auth-hero">
        <div className="flex items-center gap-3">
          <LeadersLogo height={38} />
        </div>
        <div className="mt-auto">
          <h1 className="auth-headline">
            רואים הכל,
            <br />
            <span className="auth-headline-accent">בזמן אמת.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[rgba(244,244,245,0.65)]">
            כל הביצועים במקום אחד.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-[rgba(244,244,245,0.85)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(139,92,246,0.9)]" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto pt-10 text-xs text-[rgba(244,244,245,0.4)]">Leaders · Powered by People</div>
      </div>

      {/* Form (left side in RTL) */}
      <div className="auth-form-col">
        <div className="auth-card">
          <div className="mb-6 lg:hidden">
            <LeadersLogo height={34} />
          </div>
          <h2 className="text-2xl font-bold" style={{ color: "#f4f4f5" }}>{title}</h2>
          <p className="mt-1 mb-6 text-sm text-[rgba(244,244,245,0.55)]">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
