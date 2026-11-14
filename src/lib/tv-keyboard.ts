/** The TV app's on-screen keyboard (android-tv MainActivity `JLKeyboard`); absent elsewhere. */
type TvKeyboard = { show(): void; hide(): void };

function tvKeyboard(): TvKeyboard | null {
  if (typeof window === "undefined") return null;
  const k = (window as unknown as { JLKeyboard?: TvKeyboard }).JLKeyboard;
  return k && typeof k.show === "function" ? k : null;
}

/** Opens the TV's keyboard for the field being typed in; a no-op off the TV app. */
export function showTvKeyboard(): void {
  try {
    tvKeyboard()?.show();
  } catch {
    /* An app build without the keyboard bridge: typing still works with a hardware keyboard. */
  }
}

export function hideTvKeyboard(): void {
  try {
    tvKeyboard()?.hide();
  } catch {
    /* As above. */
  }
}
