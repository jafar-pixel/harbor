import { MusicView } from "@/views/web-music";
import { BP_PAGE_TOP } from "./bp-rail";

export function BpMusic() {
  return (
    <section data-bp-shared-hub className={`flex h-full min-h-0 flex-col ${BP_PAGE_TOP}`}>
      <MusicView active />
    </section>
  );
}
