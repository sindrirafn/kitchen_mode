import { CheckRow, Icon } from "./components";
import { isLongLeadPreparation, type Recipe, type Session } from "./model";
import { StructuredContent } from "./recipe-content";

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
}: {
  recipe: Recipe;
  session: Session;
  onCheck: (id: string) => void;
}) {
  const sections = preparationSections(recipe);
  function cards(groups: typeof sections.ordinary, early = false) {
    return (
      <div className={`prep-grid ${early ? "prep-early-grid" : ""}`}>
        {groups.map((group) => (
          <section
            className={`prep-card ${early ? "long-lead" : ""}`}
            key={group.id}
            data-source-order={group.index}
          >
            <div className="prep-card-title">
              <span>{String(group.index + 1).padStart(2, "0")}</span>
              <h2>{group.title}</h2>
            </div>
            <div className="prep-tasks">
              {group.items.map((item) => (
                <CheckRow
                  key={item.id}
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
              ))}
            </div>
            <p className="prep-group-progress small">
              {
                group.items.filter(
                  (item) =>
                    item.checkable !== false &&
                    session.checkedIds.includes(item.id),
                ).length
              }{" "}
              of {group.items.filter((item) => item.checkable !== false).length}{" "}
              tasks checked
            </p>
            {group.tip && (
              <p className="prep-tip">
                <Icon name="leaf" size={17} />
                {group.tip}
              </p>
            )}
          </section>
        ))}
      </div>
    );
  }
  return (
    <>
      {!!sections.early.length && (
        <section className="prep-early" aria-label="Start these first">
          <div className="prep-section-heading">
            <p className="eyebrow">
              <Icon name="clock" size={16} /> Allow time
            </p>
            <h2>Start these first.</h2>
            <p>Get the longer jobs underway before the rest.</p>
          </div>
          {cards(sections.early, true)}
        </section>
      )}
      {!!sections.ordinary.length && (
        <section aria-label="Preparation tasks">
          <div className="prep-section-heading">
            <p className="eyebrow">READY FOR THE PAN</p>
            <h2>A little mise en place.</h2>
            <p>Work through each group, keeping its ingredients as directed.</p>
          </div>
          {cards(sections.ordinary)}
        </section>
      )}
    </>
  );
}
