import {
  Settings2,
  Play,
  Captions,
  Check,
  ChevronRight,
  FileText,
  LogOut,
  MonitorSmartphone,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMobileAccess } from "./mobile-access";
import { useView } from "@/lib/view";
import type { SectionId } from "@/views/settings/shared";
import { useAuth } from "@/lib/auth";
import { useProfiles } from "@/lib/profiles";
import { useT } from "@/lib/i18n";
import { MobileWhosWatching } from "./mobile-whos-watching";
import { useMobileRemote } from "./mobile-remote";
import { setMobileRemoteStyle, useMobileRemoteStyle, type MobileRemoteStyle } from "./remote-style";
import { openUrl } from "@/lib/window";

export function MobileProfile({
  onOpenRemote,
  onOpenWorkspace,
}: {
  onOpenRemote: () => void;
  onOpenWorkspace: () => void;
}) {
  const { openSettings } = useView();
  const access = useMobileAccess();
  const settings = (section: SectionId) => {
    access.run(() => {
      openSettings(section);
      onOpenWorkspace();
    });
  };
  const t = useT();
  const { user, signOut } = useAuth();
  const { activeProfile, openPicker } = useProfiles();
  const { snapshot, remoteMode, connected } = useMobileRemote();
  // Paired remotes select a host profile; standalone phones manage their own roster.
  const hostProfiles = remoteMode || connected;
  const remote = snapshot.profile;
  const name = remote?.name || activeProfile?.name || user?.email?.split("@")[0] || t("Guest");
  const avatar = remote?.avatar ?? activeProfile?.avatar ?? null;
  const color = remote?.color ?? activeProfile?.color ?? "oklch(0.78 0.13 60)";
  const [switching, setSwitching] = useState(false);

  return (
    <div className="flex h-full flex-col gap-6 px-5 pt-4">
      <header className="flex items-center justify-center">
        <h1 className="font-display text-[22px] font-medium text-ink">{t("Profile")}</h1>
      </header>

      <button
        type="button"
        onClick={() => (hostProfiles ? setSwitching(true) : access.run(() => openPicker()))}
        disabled={!hostProfiles && !!activeProfile?.kid}
        className="flex flex-col items-center gap-3 transition-transform active:scale-[0.98] disabled:active:scale-100"
      >
        <span
          className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full text-[30px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(0,0,0,0.6)]"
          style={{ background: avatar ? undefined : color }}
        >
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>
        <span className="text-[18px] font-semibold text-ink">{name}</span>
        {hostProfiles && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
            <Users size={14} strokeWidth={2.4} />
            {t("Switch profile")}
          </span>
        )}
      </button>

      {remoteMode && (
        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            {t("Remote style")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StylePreview kind="dpad" label={t("D-pad")} />
            <StylePreview kind="minimal" label={t("Touchpad")} />
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40">
        {remoteMode && (
          <>
            <Row
              icon={<MonitorSmartphone size={20} strokeWidth={2} />}
              label={t("Remote")}
              onClick={onOpenRemote}
            />
            <Divider />
          </>
        )}
        {!activeProfile?.kid && (
          <>
            <Row
              icon={<Users size={20} />}
              label={t("Account")}
              onClick={() => settings("account")}
            />
            <Divider />
            <Row
              icon={<Users size={20} />}
              label={t("Manage profiles")}
              onClick={() => access.run(() => openPicker())}
            />
            <Divider />
            <Row
              icon={<Settings2 size={20} />}
              label={t("Settings")}
              onClick={() => settings("basics")}
            />
            <Divider />
            <Row
              icon={<Play size={20} />}
              label={t("Streaming & providers")}
              onClick={() => settings("streaming")}
            />
            <Divider />
            <Row
              icon={<Captions size={20} />}
              label={t("Subtitles & language")}
              onClick={() => settings("subtitles")}
            />
            <Divider />
            <Row
              icon={<FileText size={20} />}
              label={t("Legal")}
              onClick={() => settings("licenses")}
            />
          </>
        )}
        {user && (
          <>
            <Divider />
            <Row
              icon={<LogOut size={20} strokeWidth={2} />}
              label={t("Sign out")}
              danger
              onClick={signOut}
            />
          </>
        )}
      </section>

      {access.prompt}
      {switching && <MobileWhosWatching onClose={() => setSwitching(false)} />}
    </div>
  );
}

function StylePreview({ kind, label }: { kind: MobileRemoteStyle; label: string }) {
  const active = useMobileRemoteStyle() === kind;
  return (
    <button
      type="button"
      onClick={() => setMobileRemoteStyle(kind)}
      className={`relative flex flex-col items-center gap-3 rounded-2xl border bg-surface/50 p-4 transition-colors ${
        active ? "border-accent ring-1 ring-accent" : "border-edge-soft/70"
      }`}
    >
      {active && (
        <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <span className="flex h-[104px] w-full items-center justify-center rounded-xl bg-canvas/60">
        {kind === "dpad" ? <DpadGlyph /> : <TouchpadGlyph />}
      </span>
      <span className={`text-[13.5px] font-semibold ${active ? "text-ink" : "text-ink-muted"}`}>
        {label}
      </span>
    </button>
  );
}

function DpadGlyph() {
  return (
    <span className="relative grid h-[74px] w-[74px] place-items-center rounded-full bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="absolute top-1.5 h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-ink-muted" />
      <span className="absolute bottom-1.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-ink-muted" />
      <span className="absolute start-1.5 h-0 w-0 border-y-[5px] border-e-[7px] border-y-transparent border-e-ink-muted" />
      <span className="absolute end-1.5 h-0 w-0 border-y-[5px] border-s-[7px] border-y-transparent border-s-ink-muted" />
      <span className="h-7 w-7 rounded-full bg-raised" />
    </span>
  );
}

function TouchpadGlyph() {
  return (
    <span className="relative flex h-[62px] w-[74px] items-center justify-center rounded-2xl bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="h-2 w-2 rounded-full bg-ink-muted" />
      <span className="absolute h-[3px] w-8 -rotate-[18deg] rounded-full bg-ink-subtle/50" />
    </span>
  );
}

/* `href` renders a real anchor rather than a button calling window.open. This
   screen is where the setup flow lands people, and a programmatic open that a
   mobile browser does not credit as a user gesture can navigate the current
   tab instead, which is how a viewer ends up outside Harbor with no way back. */
function Row({
  icon,
  label,
  onClick,
  href,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const skin =
    "flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/60";
  const inner = (
    <>
      <span className={danger ? "text-danger" : "text-ink-muted"}>{icon}</span>
      <span className={`flex-1 text-[15px] font-medium ${danger ? "text-danger" : "text-ink"}`}>
        {label}
      </span>
      {!danger && <ChevronRight size={18} strokeWidth={2.2} className="text-ink-subtle" />}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!("__TAURI_INTERNALS__" in window)) return;
          e.preventDefault();
          openUrl(href);
        }}
        className={skin}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={skin}>
      {inner}
    </button>
  );
}

function Divider() {
  return <span className="mx-4 block h-px bg-edge-soft/60" />;
}
