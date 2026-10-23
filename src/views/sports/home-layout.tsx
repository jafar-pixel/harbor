import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Settings2, X } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  SPORTS_HOME_SHELVES,
  DEFAULT_SPORTS_HOME_ORDER,
  DEFAULT_SPORTS_HOME_HIDDEN,
  sportsHomeOrder,
  sportsHomeHidden,
  moveSportsShelf,
  type SportsShelfId,
} from "@/lib/sports/home-layout";

export function SportsHomeLayout({
  items,
  onSports,
}: {
  items: Array<{ id: SportsShelfId; content: ReactNode }>;
  onSports: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const order = sportsHomeOrder(settings.sportsHomeOrder);
  const hidden = sportsHomeHidden(settings.sportsHomeHidden);
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button className="sh-button" onClick={() => setEditing(true)}>
          <Settings2 size={16} />
          {t("Customize page")}
        </button>
        <button className="sh-text-button" onClick={onSports}>
          {t("Sports, leagues & teams")}
        </button>
      </div>
      <div className="flex flex-col gap-8">
        {order
          .filter((id) => !hidden.includes(id))
          .map((id) => {
            const item = items.find((item) => item.id === id);
            return item?.content ? (
              <div key={id} data-sports-shelf={id}>
                {item.content}
              </div>
            ) : null;
          })}
      </div>
      {editing && (
        <ModalShell
          closing={false}
          onDismiss={() => setEditing(false)}
          width={720}
          labelledBy="sports-layout-title"
        >
          <div className="sh-setup-head">
            <div>
              <h2 id="sports-layout-title">{t("Customize Sports Hub")}</h2>
              <p>
                {t("Show, hide, and reorder every shelf. All shelves follow your selected sports.")}
              </p>
            </div>
            <button className="sh-icon" aria-label={t("Close")} onClick={() => setEditing(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="sh-setup-body">
            <button
              className="sh-button mb-4"
              onClick={() => {
                setEditing(false);
                onSports();
              }}
            >
              {t("Choose sports, leagues & teams")}
            </button>
            <ol className="flex flex-col gap-2">
              {order.map((id, index) => {
                const label = t(SPORTS_HOME_SHELVES.find((s) => s.id === id)!.label);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-xl border border-edge-soft p-3"
                  >
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(id)}
                        onChange={() =>
                          update({
                            sportsHomeHidden: hidden.includes(id)
                              ? hidden.filter((item) => item !== id)
                              : [...hidden, id],
                          })
                        }
                      />
                      {label}
                    </label>
                    {([-1, 1] as const).map((by) => (
                      <button
                        key={by}
                        className="sh-icon"
                        disabled={by === -1 ? index === 0 : index === order.length - 1}
                        aria-label={t(by === -1 ? "Move {shelf} up" : "Move {shelf} down", {
                          shelf: label,
                        })}
                        onClick={() => {
                          update({ sportsHomeOrder: moveSportsShelf(order, id, by) });
                          setMessage(t("Moved {shelf}", { shelf: label }));
                        }}
                      >
                        {by === -1 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                      </button>
                    ))}
                  </li>
                );
              })}
            </ol>
            <p role="status" aria-live="polite" className="mt-3 text-sm text-ink-muted">
              {message}
            </p>
          </div>
          <div className="sh-setup-foot">
            <button
              className="sh-button"
              onClick={() =>
                update({
                  sportsHomeOrder: [...DEFAULT_SPORTS_HOME_ORDER],
                  sportsHomeHidden: [...DEFAULT_SPORTS_HOME_HIDDEN],
                })
              }
            >
              {t("Reset shelf layout")}
            </button>
            <button className="sh-button primary" onClick={() => setEditing(false)}>
              {t("Done")}
            </button>
          </div>
        </ModalShell>
      )}
    </>
  );
}
