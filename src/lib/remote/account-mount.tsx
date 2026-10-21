import { useJlSession } from "@/lib/jl/account/client";
import { useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings";
import { isMobileDevice, isRemoteRoute, isTvApp } from "@/lib/platform";
import { RemoteOpenBridge } from "./remote-open-bridge";
import { buildRemoteSnapshot, dispatchRemoteCommand, subscribeRemoteSession } from "./session";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { setAccountRemoteHost, useAccountRemoteConnection } from "./account-remote";
function displayLabel() {
  let suffix = "";
  try {
    let id = localStorage.getItem("jl.remote.installation.v1");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("jl.remote.installation.v1", id);
    }
    suffix = " · " + id.slice(-4).toUpperCase();
  } catch {}
  const ua = navigator.userAgent;
  return (
    (isTvApp()
      ? "JL TV / Shield"
      : /Windows/i.test(ua)
        ? "JL Windows"
        : /Macintosh/i.test(ua)
          ? "JL Mac"
          : "JL Display") + suffix
  );
}
export function AccountRemoteMount() {
  useAccountRemoteConnection();
  const owner = useJlSession()?.userId;
  const { settings } = useSettings();
  const label = useRef<string | null>(null);
  if (label.current === null) label.current = displayLabel();
  const enabled = settings.remoteControlEnabled && !isRemoteRoute() && !isMobileDevice();
  useEffect(() => {
    if (!enabled || !owner) return;
    const receiver = {
      label: label.current!,
      snapshot: () => buildRemoteSnapshot(getPlaybackPosition()),
      command: dispatchRemoteCommand,
    };
    const release = setAccountRemoteHost(receiver);
    const unsubscribe = subscribeRemoteSession(() => {
      setAccountRemoteHost(receiver);
    });
    return () => {
      unsubscribe();
      release();
    };
  }, [enabled, owner]);
  return enabled && isTvApp() ? <RemoteOpenBridge /> : null;
}
