import LeadersLogo from "./LeadersLogo";

const FEATURES = [
  { icon: "📊", text: "Spend, ROAS והכנסות לכל מותג — בזמן אמת" },
  { icon: "🏪", text: "ייחוס הכנסות מהחנות לכל ערוץ ולכל קמפיין" },
  { icon: "🎬", text: "ביצועי קמפיינים, קריאייטיבים ותחזיות סוף-חודש" },
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
    <div className="auth-bg">
      {/* Hero */}
      <div className="auth-hero">
        <div className="flex items-center gap-3">
          <LeadersLogo height={38} />
        </div>
        <div className="mt-auto">
          <h1 className="auth-headline">
            Clients Performance,
            <br />
            <span className="auth-headline-accent">decoded.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[rgba(244,244,245,0.65)]">
            כל הביצועים של הלקוחות שלך במקום אחד — מתעדכן חי מהמקורות.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-[rgba(244,244,245,0.85)]" dir="rtl">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(139,92,246,0.18)] text-base">{f.icon}</span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto pt-10 text-xs text-[rgba(244,244,245,0.4)]">Leaders · Powered by People</div>
      </div>

      {/* Form */}
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
