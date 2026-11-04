import { Accordion } from "./Accordion";
import { CheckRow } from "./components";
import {
  gatheringGroups,
  isGathered,
  type Recipe,
  type Session,
} from "./model";

export function GatherGroups({
  recipe,
  session,
  onGather,
  onToggle,
}: {
  recipe: Recipe;
  session: Session;
  onGather: (ids: string[]) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="gather-sections">
      {gatheringGroups(recipe).map((group) => {
        const key = `gather:${group.id}`;
        return (
          <Accordion
            key={key}
            title={group.title}
            completed={
              group.items.filter((item) =>
                isGathered(item, session.gatheredIds),
              ).length
            }
            total={group.items.length}
            collapsed={!!session.collapsedSectionIds?.includes(key)}
            onToggle={() => onToggle(key)}
            className={group.id === "equipment" ? "equipment-section" : ""}
          >
            <div className="gather-checklist">
              {group.items.map((item) => {
                const amountAfter =
                  item.amount.includes(" + ") ||
                  (item.amount && !/^\d|^[¼½¾⅛⅜⅝⅞]/.test(item.amount));
                return (
                  <div className="gather-item" key={item.id}>
                    <CheckRow
                      id={item.id}
                      checked={isGathered(item, session.gatheredIds)}
                      indeterminate={
                        !isGathered(item, session.gatheredIds) &&
                        item.sourceIds.some((id) =>
                          session.gatheredIds.includes(id),
                        )
                      }
                      onChange={() => onGather(item.sourceIds)}
                      text={
                        <>
                          {amountAfter ? (
                            <>
                              {item.name} · <b>{item.amount}</b>
                            </>
                          ) : (
                            <>
                              <b>{item.amount}</b>
                              {item.amount ? " " : ""}
                              {item.name}
                            </>
                          )}
                          {item.optional && <em> · optional</em>}
                          {item.detail && <small>{item.detail}</small>}
                        </>
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Accordion>
        );
      })}
    </div>
  );
}
