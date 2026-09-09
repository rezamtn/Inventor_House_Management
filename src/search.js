// Pure, framework-free hierarchical search over the inventory data tree.
// Kept separate from App.jsx so it can be unit tested with `node --test`
// without pulling in React/JSX.

export function normalizePersian(s) {
  if (!s) return "";
  return s.replace(/ي/g, "ی").replace(/ك/g, "ک");
}

export function normalizeForSearch(s) {
  return normalizePersian(s || "").toLowerCase();
}

function itemResult(item, ctx, matchedByLocation, matchedLocationLabel) {
  return {
    type: "item",
    id: item.id,
    name: item.name,
    qty: item.qty,
    unit: item.unit,
    status: item.status,
    houseId: ctx.houseId,
    houseName: ctx.houseName,
    sectorId: ctx.sectorId,
    sectorLabel: ctx.sectorLabel,
    sectorIcon: ctx.sectorIcon,
    secId: ctx.secId || null,
    subId: ctx.subId || null,
    path: ctx.path,
    matchedByLocation: !!matchedByLocation,
    matchedLocationLabel: matchedByLocation ? matchedLocationLabel : null,
  };
}

function locationResult(key, label, matchedField, ctx) {
  return {
    type: "location",
    key,
    label,
    matchedField,
    houseId: ctx.houseId,
    houseName: ctx.houseName,
    sectorId: ctx.sectorId,
    sectorLabel: ctx.sectorLabel,
    sectorIcon: ctx.sectorIcon,
    secId: ctx.secId || null,
    subId: ctx.subId || null,
  };
}

// Searches the whole `data.houses` tree for `query`, matching (in order of
// hierarchy) house name, sector/category name, section name, subsection
// name, item name, and the item's full location path. When a location
// (sector/section/subsection) matches, that location is returned as a
// result of its own, and every item nested under it is also returned,
// flagged with `matchedByLocation: true` even if the item's own name does
// not contain the query.
export function searchInventory(data, query, SECTORS) {
  const q = normalizeForSearch((query || "").trim());
  if (!data || !q) return [];
  const results = [];

  function walkItems(items, ctx, matchedByLocation, matchedLocationLabel) {
    const joinedPath = normalizeForSearch(ctx.pathNames.join(" "));
    const pathMatches = joinedPath.includes(q);
    (items || []).forEach(item => {
      const nameMatches = normalizeForSearch(item.name).includes(q);
      if (nameMatches || matchedByLocation || pathMatches) {
        const viaLocation = !nameMatches;
        results.push(itemResult(item, ctx, viaLocation, matchedLocationLabel));
      }
    });
  }

  data.houses.forEach(h => {
    const houseNameMatches = normalizeForSearch(h.name).includes(q);

    SECTORS.forEach(sec => {
      const sd = h.sectors?.[sec.id];
      if (!sd) return;

      const sectorLabelMatches = normalizeForSearch(sec.label).includes(q);
      const sectorLocationMatch = houseNameMatches || sectorLabelMatches;
      const baseCtx = { houseId: h.id, houseName: h.name, sectorId: sec.id, sectorLabel: sec.label, sectorIcon: sec.icon };

      if (sectorLocationMatch) {
        results.push(locationResult(
          `loc:${h.id}:${sec.id}`,
          houseNameMatches ? `🏠 ${h.name} › ${sec.icon} ${sec.label}` : `${sec.icon} ${sec.label}`,
          houseNameMatches ? "house" : "sector",
          { ...baseCtx, secId: null, subId: null }
        ));
      }

      walkItems(
        sd.items,
        { ...baseCtx, path: "مستقیم", secId: null, subId: null, pathNames: [h.name, sec.label] },
        sectorLocationMatch,
        houseNameMatches ? h.name : sec.label
      );

      (sd.sections || []).forEach(s => {
        const sectionNameMatches = normalizeForSearch(s.name).includes(q);
        const sectionLocationMatch = sectorLocationMatch || sectionNameMatches;

        if (sectionNameMatches) {
          results.push(locationResult(
            `loc:${h.id}:${sec.id}:${s.id}`,
            `${sec.icon} ${sec.label} › ${s.name}`,
            "section",
            { ...baseCtx, secId: s.id, subId: null }
          ));
        }

        walkItems(
          s.items,
          { ...baseCtx, path: s.name, secId: s.id, subId: null, pathNames: [h.name, sec.label, s.name] },
          sectionLocationMatch,
          sectionNameMatches ? s.name : (houseNameMatches ? h.name : sec.label)
        );

        (s.subsections || []).forEach(sub => {
          const subNameMatches = normalizeForSearch(sub.name).includes(q);
          const subLocationMatch = sectionLocationMatch || subNameMatches;

          if (subNameMatches) {
            results.push(locationResult(
              `loc:${h.id}:${sec.id}:${s.id}:${sub.id}`,
              `${sec.icon} ${sec.label} › ${s.name} › ${sub.name}`,
              "subsection",
              { ...baseCtx, secId: s.id, subId: sub.id }
            ));
          }

          walkItems(
            sub.items,
            { ...baseCtx, path: `${s.name} › ${sub.name}`, secId: s.id, subId: sub.id, pathNames: [h.name, sec.label, s.name, sub.name] },
            subLocationMatch,
            subNameMatches ? sub.name : (sectionNameMatches ? s.name : (houseNameMatches ? h.name : sec.label))
          );
        });
      });
    });
  });

  return results;
}
