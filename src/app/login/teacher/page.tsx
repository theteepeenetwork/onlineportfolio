import Link from "next/link";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { TeacherLoginForm } from "./form";

// Design: "Teacher login page redesign", option 1b — a jar peeks over the top
// of the sign-in card while children's work tiles float around it. All the
// decoration is aria-hidden; the form itself is untouched.

// One floating tile: a mini piece of "work" on a cream/coloured square.
function WorkTile({
  left,
  top,
  tilt,
  duration,
  delay,
  bg,
  children,
}: {
  left: string;
  top: string;
  tilt: string;
  duration: string;
  delay?: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="sj-float sj-login-decor"
      style={
        {
          position: "absolute",
          left,
          top,
          "--r": tilt,
          animationDuration: duration,
          animationDelay: delay,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 6,
          background: bg,
          border: "3px solid var(--ink)",
          boxShadow: "0 4px 0 rgba(34,48,74,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Twinkle({
  left,
  top,
  size,
  fill,
  duration,
  delay,
}: {
  left: string;
  top: string;
  size: number;
  fill: string;
  duration: string;
  delay?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      className="sj-twinkle sj-login-decor"
      style={{ position: "absolute", left, top, animationDuration: duration, animationDelay: delay }}
      aria-hidden="true"
    >
      <path
        d="M0,-12 C2,-4 4,-2 12,0 C4,2 2,4 0,12 C-2,4 -4,2 -12,0 C-4,-2 -2,-4 0,-12 Z"
        fill={fill}
      />
    </svg>
  );
}

export default function TeacherLoginPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden p-6">
      {/* top-left brand, home link */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 self-start"
        style={{ color: "var(--ink)" }}
      >
        <JarLogo width={26} height={31} />
        <span className="font-display text-[22px] font-semibold tracking-tight">storyjar</span>
      </Link>

      <div className="relative flex flex-1 items-center justify-center">
        {/* floating work tiles + twinkles scattered on the paper */}
        <WorkTile left="calc(50% - 320px)" top="calc(50% - 150px)" tilt="-9deg" duration="6s" bg="var(--cream)">
          <svg width="32" height="32" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="10" fill="var(--honey)" />
            <g stroke="var(--honey)" strokeWidth="3.5" strokeLinecap="round">
              <path d="M28,8 v6" /><path d="M28,42 v6" /><path d="M8,28 h6" /><path d="M42,28 h6" />
              <path d="M14,14 l4,4" /><path d="M42,42 l-4,-4" /><path d="M42,14 l-4,4" /><path d="M14,42 l4,-4" />
            </g>
          </svg>
        </WorkTile>
        <WorkTile left="calc(50% + 250px)" top="calc(50% - 170px)" tilt="8deg" duration="7s" delay="0.8s" bg="var(--honey)">
          <span className="font-display text-[32px] font-semibold" style={{ color: "#7a4e10" }}>a</span>
        </WorkTile>
        <WorkTile left="calc(50% - 340px)" top="calc(50% + 110px)" tilt="6deg" duration="6.6s" delay="0.4s" bg="var(--pink)">
          <svg width="36" height="36" viewBox="0 0 60 60">
            <path d="M30,44 C14,32 16,18 24,17 C28,16.5 30,20 30,23 C30,20 32,16.5 36,17 C44,18 46,32 30,44 Z" fill="var(--cream)" />
          </svg>
        </WorkTile>
        <WorkTile left="calc(50% + 285px)" top="calc(50% + 130px)" tilt="-7deg" duration="7.4s" delay="1.2s" bg="var(--glass)">
          <svg width="32" height="32" viewBox="0 0 56 56">
            <path d="M10,40 C18,22 24,22 28,36 C32,50 40,50 44,30 C47,20 52,20 54,28" fill="none" stroke="var(--glass-jar)" strokeWidth="5" strokeLinecap="round" />
          </svg>
        </WorkTile>
        <WorkTile left="calc(50% + 300px)" top="calc(50% - 30px)" tilt="4deg" duration="8s" delay="0.2s" bg="var(--blue)">
          <span className="font-display text-[20px] font-semibold" style={{ color: "var(--cream)" }}>cat</span>
        </WorkTile>
        <WorkTile left="calc(50% - 355px)" top="calc(50% - 20px)" tilt="-5deg" duration="7.7s" delay="1.5s" bg="var(--green)">
          <span className="font-display text-[22px] font-semibold" style={{ color: "#37541f" }}>3+4</span>
        </WorkTile>

        <Twinkle left="calc(50% - 200px)" top="calc(50% + 200px)" size={30} fill="var(--honey)" duration="3.6s" />
        <Twinkle left="calc(50% + 200px)" top="calc(50% - 220px)" size={22} fill="var(--pink)" duration="4.2s" delay="0.5s" />
        <Twinkle left="calc(50% - 250px)" top="calc(50% - 240px)" size={18} fill="var(--honey)" duration="4.8s" delay="1s" />
        <Twinkle left="calc(50% + 240px)" top="calc(50% + 210px)" size={20} fill="var(--honey)" duration="3.9s" delay="0.7s" />

        {/* the card, with a jar peeking over its top edge */}
        <div className="relative w-full max-w-sm" style={{ marginTop: 70 }}>
          <div
            data-jar-jiggle="on"
            className="absolute left-1/2 z-[2]"
            style={{ top: -70, translate: "-50% 0", transformOrigin: "50% 100%" }}
            aria-hidden="true"
          >
            <svg width="110" height="97" viewBox="0 0 100 88" style={{ display: "block" }}>
              <rect x="26" y="4" width="48" height="14" rx="7" fill="var(--kraft)" stroke="var(--ink)" strokeWidth="4" />
              <path
                d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,84 L14,84 L14,58 C14,46 18,36 30,30 Z"
                fill="var(--glass-jar)"
                stroke="var(--ink)"
                strokeWidth="5"
                strokeLinejoin="round"
              />
              <rect x="30" y="60" width="16" height="16" rx="3" fill="var(--jam)" transform="rotate(-8 38 68)" />
              <rect x="52" y="64" width="16" height="16" rx="3" fill="var(--honey)" transform="rotate(6 60 72)" />
              <rect x="42" y="46" width="16" height="16" rx="3" fill="var(--glass)" transform="rotate(-4 50 54)" />
            </svg>
          </div>

          <div className="card relative px-8 pb-8 pt-12 text-center">
            <Link
              href="/"
              className="absolute left-5 top-4 text-[13px] font-bold text-muted hover:text-foreground"
            >
              ← Back
            </Link>
            <h1 className="text-[32px] font-semibold leading-tight">Hello again!</h1>
            <p className="mt-2 text-[15px] text-muted">Sign in to your class jars.</p>
            <div className="text-left">
              <TeacherLoginForm />
            </div>
            <p className="mt-5 text-sm text-muted">
              New here?{" "}
              <Link href="/signup/teacher" className="font-bold text-brand hover:underline">
                Start your class jar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
