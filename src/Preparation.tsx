import { CheckRow, Icon } from "./components";
import { isLongLeadPreparation, type Recipe, type Session } from "./model";
import { StructuredContent } from "./recipe-content";
import { Accordion } from "./Accordion";

export function preparationSections(recipe: Recipe) {
  const groups = recipe.preparation.map((group, index) => ({
    ...group,
    index,
  }));
  const leads = (
    group: (typeof groups)[number],
    item: (typeof group.items)[number],
  ) => item.longLead ?? isLongLeadPreparation(group);
  return {
    early: groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => leads(group, item)),
        tip: group.items.every((item) => leads(group, item))
          ? group.tip
          : undefined,
      }))
      .filter((group) => group.items.length),
    ordinary: groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !leads(group, item)),
      }))
      .filter((group) => group.items.length),
  };
}
export function PreparationGroups({
  recipe,
  session,
  onCheck,
  onToggle,
}: {
  recipe: Recipe;
  session: Session;
  onCheck: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const sections = preparationSections(recipe);
  function cards(groups: typeof sections.ordinary, early = false) {
    return (
      <div className="prep-grid">
        {groups.map((group) => {
          const key = `prep:${group.id}:${early ? "early" : "ordinary"}`;
          const tasks = group.items.filter((item) => item.checkable !== false);
          const title = early
            ? (group.earlyTitle ?? group.title)
            : (group.continuationTitle ?? group.title);
          return (
            <Accordion
              key={key}
              title={title}
              completed={
                tasks.filter((item) => session.checkedIds.includes(item.id))
                  .length
              }
              total={tasks.length}
              collapsed={!!session.collapsedSectionIds?.includes(key)}
              onToggle={() => onToggle(key)}
              className={`prep-section ${early ? "long-lead" : ""}`}
            >
              <ol className="prep-tasks" data-source-order={group.index}>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <CheckRow
                      id={item.id}
                      text={
                        item.content ? (
                          <StructuredContent
                            recipe={recipe}
                            blocks={item.content}
                          />
                        ) : (
                          item.text
                        )
                      }
                      checkable={item.checkable}
                      checked={session.checkedIds.includes(item.id)}
                      onChange={() => onCheck(item.id)}
                    />
                  </li>
                ))}
              </ol>
              {group.tip && (
                <p className="prep-tip">
                  <Icon name="leaf" size={17} />
                  {group.tip}
                </p>
              )}
            </Accordion>
          );
        })}
      </div>
    );
  }
  return (
    <>
      {!!sections.early.length && (
        <section className="prep-early" aria-label="Start early">
          <h2 className="start-early-heading">Start early</h2>
          {cards(sections.early, true)}
        </section>
      )}
      {!!sections.ordinary.length && (
        <section aria-label="Preparation tasks">
          {cards(sections.ordinary)}
        </section>
      )}
    </>
  );
}
